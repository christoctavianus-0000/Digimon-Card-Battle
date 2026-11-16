/**
 * Full Battle Resolution for Digimon Digital Card Battle (PS1).
 * Implements docs/RULES.md Section 7 & Section 8:
 * - Substep 3A: Void Support pre-check (Turn Player first, then Non-Turn Player)
 * - Substep 3B: Support & Option effect execution (Turn Player first, then Non-Turn Player)
 * - Substep 3C & Step 4: Active X-attack & granted abilities (Jamming -> Foe x3 -> [slot] to 0)
 * - Step 5: Attack order determination (1st Attack / attackFirst / attackSecond)
 * - Step 6: First Attacker strike (with Eat-Up HP & Crash) -> KO check -> Second Attacker Counter or strike
 * - Step 7: Post-battle cleanup, KO points, reviveOnKo, moving KO'd stack to offline while keeping dpSlot intact
 */

import { getCardById } from '../data/cards';
import { getEffectiveCardData } from '../data/digiParts';
import type {
  AttackSlot,
  CardId,
  EffectRegistry,
  GrantedAbility,
  MatchState,
  PlayerSide,
  XEffect,
} from '../types/game';
import {
  applyNumericMode,
  createEffectExecContext,
  createInitialSlotPowers,
  evaluateVoidSupportPreCheck,
  executeEffectOps,
  getEffectiveAttack,
  MAX_STAT_VALUE,
  otherSide,
  resolveCardEffectDef,
  syncComputedPowers,
} from './effectInterpreter';
import { KO_TO_WIN } from '../types/game';

/**
 * Converts a Digimon card's printed `XEffect` on its `x` attack into a `GrantedAbility`.
 */
export function xEffectToGrantedAbility(xEffect: XEffect | undefined): GrantedAbility | null {
  if (!xEffect) return null;
  switch (xEffect.type) {
    case 'zero':
      return { kind: 'toZero', slot: xEffect.target };
    case 'counter':
      return { kind: 'counter', slot: xEffect.target };
    case 'firstAttack':
      return { kind: 'firstAttack' };
    case 'eatUpHp':
      return { kind: 'eatUpHp' };
    case 'crash':
      return { kind: 'crash' };
    case 'jamming':
      return { kind: 'jamming' };
    case 'foeX3':
      return { kind: 'foeX3', specialty: xEffect.specialty };
  }
}

/**
 * Gathers a player's active abilities for Step 4/5/6, accounting for final chosen attack,
 * support-granted abilities, `removeAbility`, and opponent's `Jamming`.
 */
export function computeActiveAbilities(
  state: MatchState,
): Record<PlayerSide, GrantedAbility[]> {
  const printedBySide: Record<PlayerSide, GrantedAbility[]> = {
    player: [],
    opponent: [],
  };
  const grantedBySide: Record<PlayerSide, GrantedAbility[]> = {
    player: [],
    opponent: [],
  };

  for (const side of ['player', 'opponent'] as const) {
    const removed =
      Boolean(state.battle?.abilityRemoved?.[side]) ||
      Boolean(state.players[side].battleDigimon?.tempModifiers?.abilityRemoved);
    if (removed) continue;

    const digimon = state.players[side].battleDigimon;
    if (!digimon) continue;

    const finalSlot = getEffectiveAttack(state, side);
    if (finalSlot === 'x') {
      const card =
        getEffectiveCardData(digimon.cardId, state.config.partnerConfig?.[side]) ??
        getCardById(digimon.cardId);
      const printed = xEffectToGrantedAbility(card?.attacks?.x.effect);
      if (printed) {
        printedBySide[side].push(printed);
      }
    }

    const battleGranted = state.battle?.grantedAbilities?.[side] ?? [];
    for (const g of battleGranted) {
      grantedBySide[side].push(g);
    }
  }

  // Check if either side has Jamming active (printed on X or granted)
  const hasJamming: Record<PlayerSide, boolean> = {
    player: [...printedBySide.player, ...grantedBySide.player].some((a) => a.kind === 'jamming'),
    opponent: [...printedBySide.opponent, ...grantedBySide.opponent].some(
      (a) => a.kind === 'jamming',
    ),
  };

  const result: Record<PlayerSide, GrantedAbility[]> = {
    player: [],
    opponent: [],
  };

  for (const side of ['player', 'opponent'] as const) {
    const oppSide = otherSide(side);
    if (hasJamming[oppSide]) {
      // Opponent's Jamming nullifies this side's xEffect abilities for this battle
      const digimon = state.players[side].battleDigimon;
      if (digimon) {
        digimon.tempModifiers = digimon.tempModifiers ?? {};
        digimon.tempModifiers.jammed = true;
      }
      result[side] = [];
    } else {
      result[side] = [...printedBySide[side], ...grantedBySide[side]];
    }
  }

  return result;
}

/**
 * Determines the First Attacker and Second Attacker (defender) per RULES.md Section 7.5.
 */
export function determineAttackOrder(
  turnPlayer: PlayerSide,
  attackOrderOverride: Record<PlayerSide, 'first' | 'second' | null>,
  activeAbilities: Record<PlayerSide, GrantedAbility[]>,
): { firstAttacker: PlayerSide; defender: PlayerSide } {
  const nonTurnPlayer = otherSide(turnPlayer);

  const getPriorityRank = (side: PlayerSide): number => {
    const override = attackOrderOverride[side];
    if (override === 'first') return 2;
    if (override === 'second') return 0;
    if (activeAbilities[side].some((a) => a.kind === 'firstAttack')) return 2;
    return 1; // 'normal'
  };

  const turnRank = getPriorityRank(turnPlayer);
  const nonTurnRank = getPriorityRank(nonTurnPlayer);

  // Tie-breaker: Turn Player attacks first when ranks are equal
  if (turnRank >= nonTurnRank) {
    return { firstAttacker: turnPlayer, defender: nonTurnPlayer };
  }
  return { firstAttacker: nonTurnPlayer, defender: turnPlayer };
}

/**
 * Resolves the entire Battle Phase in-place on `state`.
 */
export function resolveBattle(state: MatchState, effectRegistry?: EffectRegistry): void {
  if (!state.battle) return;

  const turnPlayer = state.activePlayer;
  const nonTurnPlayer = otherSide(turnPlayer);
  const playerOrder: [PlayerSide, PlayerSide] = [turnPlayer, nonTurnPlayer];

  // Ensure battle sub-objects are initialized
  state.battle.effectiveAttacks = {
    player: state.battle.effectiveAttacks?.player ?? state.battle.chosenAttacks.player ?? 'circle',
    opponent:
      state.battle.effectiveAttacks?.opponent ?? state.battle.chosenAttacks.opponent ?? 'circle',
  };
  state.battle.grantedAbilities = {
    player: [...(state.battle.grantedAbilities?.player ?? [])],
    opponent: [...(state.battle.grantedAbilities?.opponent ?? [])],
  };
  state.battle.abilityRemoved = {
    player: Boolean(state.battle.abilityRemoved?.player),
    opponent: Boolean(state.battle.abilityRemoved?.opponent),
  };
  state.battle.reviveOnKo = {
    player: state.battle.reviveOnKo?.player ?? null,
    opponent: state.battle.reviveOnKo?.opponent ?? null,
  };

  const slotPowers = createInitialSlotPowers(state);
  const attackOrderOverride: Record<PlayerSide, 'first' | 'second' | null> = {
    player: null,
    opponent: null,
  };

  const sharedCtxPlayer = createEffectExecContext(state, 'player', {
    slotPowers,
    attackOrderOverride,
    effectRegistry,
  });
  syncComputedPowers(sharedCtxPlayer);

  // -------------------------------------------------------------------------
  // Substep 3A: Void Support Pre-Check (Turn Player first, then Non-Turn Player)
  // -------------------------------------------------------------------------
  for (const side of playerOrder) {
    const sup = state.battle.supportCards[side];
    if (!sup || sup.voided) continue;
    const effectDef = resolveCardEffectDef(
      sup.cardId,
      effectRegistry,
      state.config.partnerConfig?.[side],
    );
    if (!effectDef || (effectDef.timing !== 'support' && effectDef.timing !== 'both')) {
      continue;
    }
    const ctx = createEffectExecContext(state, side, {
      slotPowers,
      attackOrderOverride,
      effectRegistry,
      sourceCardId: sup.cardId,
    });
    evaluateVoidSupportPreCheck(effectDef.ops, ctx);
  }

  // -------------------------------------------------------------------------
  // Substep 3B: Support & Option Effect Execution (Turn Player first, then Non-Turn Player)
  // -------------------------------------------------------------------------
  for (const side of playerOrder) {
    const sup = state.battle.supportCards[side];
    if (!sup || sup.voided) continue;
    const card =
      getEffectiveCardData(sup.cardId, state.config.partnerConfig?.[side]) ??
      getCardById(sup.cardId);
    const effectDef = resolveCardEffectDef(
      sup.cardId,
      effectRegistry,
      state.config.partnerConfig?.[side],
    );

    if (!effectDef || (effectDef.timing !== 'support' && effectDef.timing !== 'both')) {
      // Digivolve-phase Option cards (293..300) cannot be used as Support cards;
      // if blind-flipped from Online Deck, they fizzle without triggering.
      continue;
    }

    state.events.push({
      type: 'supportTriggered',
      side,
      cardId: sup.cardId,
      text: card?.supportText ?? '',
    });

    const ctx = createEffectExecContext(state, side, {
      slotPowers,
      attackOrderOverride,
      effectRegistry,
      sourceCardId: sup.cardId,
    });
    executeEffectOps(effectDef.ops, ctx, { skipVoidSupport: true });
  }

  // -------------------------------------------------------------------------
  // Substep 3C & Step 4: Cross-Attack (xEffect) & Granted Abilities
  // Order: 1. Jamming -> 2. <Specialty> Foe x3 -> 3. [slot] to 0
  // -------------------------------------------------------------------------
  const activeAbilities = computeActiveAbilities(state);

  // 4.2: <Specialty> Foe x3
  for (const side of playerOrder) {
    const oppSide = otherSide(side);
    const oppSpec = state.players[oppSide].battleDigimon?.effectiveSpecialty;
    if (!oppSpec) continue;

    for (const ability of activeAbilities[side]) {
      if (ability.kind === 'foeX3' && ability.specialty === oppSpec) {
        const chosenSlot = getEffectiveAttack(state, side);
        const before = slotPowers[side][chosenSlot];
        const after = applyNumericMode(before, 'multiply', 3, 'attackPower');
        slotPowers[side][chosenSlot] = after;
        state.battle.computedPowers[side] = after;
        state.events.push({
          type: 'statModified',
          side,
          stat: 'attackPower',
          delta: after - before,
          newValue: after,
          reason: `${ability.specialty} Foe x3`,
        });
      }
    }
  }

  // 4.3: [slot] to 0 (applies AFTER Support boosts and Foe x3!)
  for (const side of playerOrder) {
    const oppSide = otherSide(side);
    const oppChosenSlot = getEffectiveAttack(state, oppSide);
    for (const ability of activeAbilities[side]) {
      if (ability.kind === 'toZero' && ability.slot === oppChosenSlot) {
        const before = slotPowers[oppSide][oppChosenSlot];
        slotPowers[oppSide][oppChosenSlot] = 0;
        state.battle.computedPowers[oppSide] = 0;
        state.events.push({
          type: 'statModified',
          side: oppSide,
          stat: 'attackPower',
          delta: -before,
          newValue: 0,
          reason: `[[${ability.slot}]] to 0`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Attack Order Determination
  // -------------------------------------------------------------------------
  const { firstAttacker, defender: secondAttacker } = determineAttackOrder(
    turnPlayer,
    attackOrderOverride,
    activeAbilities,
  );
  state.battle.firstAttacker = firstAttacker;
  state.battle.defender = secondAttacker;

  // -------------------------------------------------------------------------
  // Step 6: Damage & Combat Execution
  // -------------------------------------------------------------------------
  const executeStrike = (
    attacker: PlayerSide,
    target: PlayerSide,
    options?: { isCounter?: boolean; counterBasePower?: number },
  ) => {
    const dAttacker = state.players[attacker].battleDigimon;
    const dTarget = state.players[target].battleDigimon;
    if (!dAttacker || !dTarget) return;
    if (dAttacker.currentHp <= 0 || dTarget.currentHp <= 0) return;

    const slot: AttackSlot = getEffectiveAttack(state, attacker);
    const attackerCard = getCardById(dAttacker.cardId);
    const attackName = attackerCard?.attacks?.[slot]?.name ?? slot;
    const abilities = activeAbilities[attacker];

    let damage = 0;
    let crashSelfDamage: number | undefined;

    if (options?.isCounter) {
      const oppAtkPower = options.counterBasePower ?? 0;
      const ownAtkPower = state.battle!.computedPowers[attacker];
      damage = Math.max(0, Math.min(MAX_STAT_VALUE, oppAtkPower * 2 + ownAtkPower));
      state.battle!.computedPowers[attacker] = damage;
      slotPowers[attacker][slot] = damage;
    } else if (abilities.some((a) => a.kind === 'crash')) {
      const ownAtkPower = state.battle!.computedPowers[attacker];
      damage = Math.max(0, Math.min(MAX_STAT_VALUE, dAttacker.currentHp + ownAtkPower));
      state.battle!.computedPowers[attacker] = damage;
      slotPowers[attacker][slot] = damage;
      crashSelfDamage = Math.max(0, dAttacker.currentHp - 10);
      dAttacker.currentHp = 10;
    } else {
      damage = Math.max(0, state.battle!.computedPowers[attacker]);
    }

    const defenderHpBefore = dTarget.currentHp;
    const defenderHpAfter = Math.max(0, defenderHpBefore - damage);
    dTarget.currentHp = defenderHpAfter;

    let eatUpHpHealed: number | undefined;
    if (abilities.some((a) => a.kind === 'eatUpHp') && damage > 0) {
      const hpBeforeHeal = dAttacker.currentHp;
      dAttacker.currentHp = Math.min(MAX_STAT_VALUE, hpBeforeHeal + damage);
      eatUpHpHealed = dAttacker.currentHp - hpBeforeHeal;
    }

    state.events.push({
      type: 'attackStrike',
      attacker,
      defender: target,
      slot,
      attackName,
      damage,
      defenderHpBefore,
      defenderHpAfter,
      ...(options?.isCounter ? { countered: true } : {}),
      ...(eatUpHpHealed !== undefined ? { eatUpHpHealed } : {}),
      ...(crashSelfDamage !== undefined ? { crashSelfDamage } : {}),
    });
  };

  const firstAttackerPower = state.battle.computedPowers[firstAttacker];

  // 6A: First Attacker Strikes
  executeStrike(firstAttacker, secondAttacker);

  // 6B: Second Attacker Strikes (only if Second Attacker survived with HP > 0!)
  const dSecondAfterFirstHit = state.players[secondAttacker].battleDigimon;
  const dFirstAfterFirstHit = state.players[firstAttacker].battleDigimon;
  if (
    dSecondAfterFirstHit &&
    dSecondAfterFirstHit.currentHp > 0 &&
    dFirstAfterFirstHit &&
    dFirstAfterFirstHit.currentHp > 0
  ) {
    const firstFinalSlot = getEffectiveAttack(state, firstAttacker);
    const hasMatchingCounter = activeAbilities[secondAttacker].some(
      (a) => a.kind === 'counter' && (a.slot === 'any' || a.slot === firstFinalSlot),
    );

    if (hasMatchingCounter) {
      executeStrike(secondAttacker, firstAttacker, {
        isCounter: true,
        counterBasePower: firstAttackerPower,
      });
    } else {
      executeStrike(secondAttacker, firstAttacker);
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Post-Battle Cleanup, KO Points, reviveOnKo & Win Check
  // -------------------------------------------------------------------------
  // 7.1: Move Support cards to offline pile
  for (const side of playerOrder) {
    const sup = state.battle.supportCards[side];
    if (sup) {
      state.players[side].offline.push(sup.cardId);
      state.events.push({
        type: 'cardsMoved',
        side,
        from: 'battle',
        to: 'offline',
        cardIds: [sup.cardId],
        count: 1,
      });
      state.battle.supportCards[side] = null;
    }
  }

  // 7.2: Process KOs and reset temporary battle modifiers on surviving Digimon
  // Check secondAttacker first (in case firstAttacker KO'd them first), then firstAttacker
  const koCheckOrder: [PlayerSide, PlayerSide] = [secondAttacker, firstAttacker];
  for (const side of koCheckOrder) {
    const player = state.players[side];
    const digimon = player.battleDigimon;
    if (!digimon) continue;

    const baseCard = getCardById(digimon.cardId);
    const reviveHp =
      state.battle.reviveOnKo?.[side] ?? digimon.tempModifiers?.reviveOnKoHp ?? null;

    if (digimon.currentHp <= 0) {
      const scorerSide = otherSide(side);
      state.players[scorerSide].koCount += 1;
      const newKoCount = state.players[scorerSide].koCount;

      if (reviveHp !== null && reviveHp > 0) {
        // Revive on KO: opponent still scores +1 KO point ("Battle is still lost"),
        // but Digimon stays in the Battle Area with `reviveHp` HP!
        digimon.currentHp = reviveHp;
        if (baseCard?.specialty) {
          digimon.effectiveSpecialty = baseCard.specialty;
        }
        digimon.tempModifiers = undefined;
        state.events.push({
          type: 'digimonKo',
          side,
          cardId: digimon.cardId,
          bySide: scorerSide,
          newKoCount,
          revivedHp: reviveHp,
        });
      } else {
        // Normal KO: move entire battle stack (excluding virtual Armor Level 'A' forms) to offline.
        // DP Slot remains completely intact!
        const stackCards: CardId[] = [...digimon.stack, digimon.cardId].filter(
          (cid) => getCardById(cid)?.level !== 'A',
        );
        player.offline.push(...stackCards);
        player.battleDigimon = null;
        if (stackCards.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'battle',
            to: 'offline',
            cardIds: stackCards,
            count: stackCards.length,
          });
        }
        state.events.push({
          type: 'digimonKo',
          side,
          cardId: digimon.cardId,
          bySide: scorerSide,
          newKoCount,
        });
      }

      if (newKoCount >= KO_TO_WIN && state.winner === null) {
        state.winner = scorerSide;
        state.winReason = 'three_ko';
        state.phase = 'gameOver';
        state.events.push({
          type: 'gameOver',
          winner: scorerSide,
          reason: 'three_ko',
        });
      }
    } else {
      // Surviving Digimon keeps its remaining currentHp into the next turn!
      // Reset temporary battle modifiers and specialty back to printed values.
      if (baseCard?.specialty) {
        digimon.effectiveSpecialty = baseCard.specialty;
      }
      digimon.tempModifiers = undefined;
    }
  }
}
