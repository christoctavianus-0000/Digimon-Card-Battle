/**
 * Normal AI (Tactical Heuristic Player) & Shared Fair-Information Utilities
 * for Digimon Digital Card Battle (PS1).
 *
 * Guarantees strict information hiding:
 * - Never inspects opponent's actual `hand` card IDs.
 * - Never inspects the ordering or actual card IDs in either player's `online` deck.
 * - Never inspects opponent's hidden `chosenAttacks` or unrevealed `supportCards`.
 * - Derives all deterministic tie-breakers / rollouts purely from `VisibleMatchState`.
 */

import { ALL_CARDS, getCardById } from '../data/cards';
import { getCardEffect, isBattleSupportOption, isDigivolvePhaseOption } from '../data/effects';
import {
  ARMOR_LINEAGE,
  getLegalActions,
  getLevelRank,
  getTurnStarter,
  getVisibleState,
  hasAddedDpThisTurn,
  isRookieCard,
  nextRng,
  otherSide,
  resolveBattle,
} from '../engine';
import type {
  Action,
  AttackSlot,
  CardData,
  CardId,
  GameEvent,
  MatchState,
  PlayerSide,
  Specialty,
  SupportSlotCard,
  VisibleMatchState,
} from '../types/game';

export const ATTACK_SLOTS: readonly AttackSlot[] = ['circle', 'triangle', 'x'];

// ---------------------------------------------------------------------------
// 1. Fair Information Hiding & Deterministic Visible-State Sanitization
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash mixer for deterministic seeding from visible state only.
 */
function fnvMix(hash: number, value: number): number {
  let h = (hash ^ (value & 0xffff)) >>> 0;
  h = Math.imul(h, 0x01000193) >>> 0;
  h = (h ^ ((value >>> 16) & 0xffff)) >>> 0;
  h = Math.imul(h, 0x01000193) >>> 0;
  return h;
}

function phaseToCode(phase: string): number {
  switch (phase) {
    case 'mulligan':
      return 1;
    case 'draw':
      return 2;
    case 'rookiePlacement':
      return 3;
    case 'digivolve':
      return 4;
    case 'attackSelect':
      return 5;
    case 'supportSelect':
      return 6;
    case 'battleResolve':
      return 7;
    case 'turnEnd':
      return 8;
    default:
      return 9;
  }
}

function slotToCode(slot: AttackSlot | 'hidden' | null | undefined): number {
  switch (slot) {
    case 'circle':
      return 1;
    case 'triangle':
      return 2;
    case 'x':
      return 3;
    default:
      return 0;
  }
}

function specialtyToCode(spec: Specialty | null | undefined): number {
  switch (spec) {
    case 'Fire':
      return 1;
    case 'Ice':
      return 2;
    case 'Nature':
      return 3;
    case 'Darkness':
      return 4;
    case 'Rare':
      return 5;
    default:
      return 0;
  }
}

/**
 * Checks whether `side` has entered the `digivolve` phase on the current turn
 * by inspecting public `phaseChanged` events since the last `turnEnd`.
 */
export function hasSideEnteredDigivolveOnTurn(
  events: readonly GameEvent[],
  turnNumber: number,
  side: PlayerSide,
): boolean {
  let startIdx = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.type === 'phaseChanged' && ev.phase === 'turnEnd') {
      startIdx = i + 1;
      break;
    }
  }
  for (let i = startIdx; i < events.length; i++) {
    const ev = events[i]!;
    if (
      ev.type === 'phaseChanged' &&
      ev.phase === 'digivolve' &&
      ev.turnNumber === turnNumber &&
      ev.activePlayer === side
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Computes a deterministic 32-bit seed purely from information visible to `side`.
 * Never reads `online` card ordering, opponent's `hand` card IDs, opponent's
 * unrevealed `chosenAttacks`, `state.rngSeed`, or private draw events.
 */
export function computeVisibleStateSeed(
  visible: VisibleMatchState,
  side: PlayerSide,
  addedDpThisTurn: boolean,
): number {
  const oppSide = otherSide(side);
  const selfP = visible.players[side];
  const oppP = visible.players[oppSide];

  let h = 0x811c9dc5;
  h = fnvMix(h, side === 'player' ? 1 : 2);
  h = fnvMix(h, visible.turnNumber);
  h = fnvMix(h, visible.activePlayer === 'player' ? 1 : 2);
  h = fnvMix(h, phaseToCode(visible.phase));
  h = fnvMix(h, addedDpThisTurn ? 1 : 0);

  // Own visible state (including own hand card IDs)
  h = fnvMix(h, selfP.onlineCount);
  h = fnvMix(h, selfP.handCount);
  for (const cid of selfP.hand) {
    h = fnvMix(h, cid + 1);
  }
  h = fnvMix(h, selfP.dpTotal);
  for (const cid of selfP.dpSlot) {
    h = fnvMix(h, cid + 1);
  }
  h = fnvMix(h, selfP.offline.length);
  for (const cid of selfP.offline) {
    h = fnvMix(h, cid + 1);
  }
  h = fnvMix(h, selfP.koCount);
  if (selfP.battleDigimon) {
    h = fnvMix(h, selfP.battleDigimon.cardId + 1);
    h = fnvMix(h, selfP.battleDigimon.currentHp);
    h = fnvMix(h, specialtyToCode(selfP.battleDigimon.effectiveSpecialty));
    h = fnvMix(h, selfP.battleDigimon.stack.length);
  } else {
    h = fnvMix(h, 0);
  }

  // Opponent visible state (ONLY counts for hand and online!)
  h = fnvMix(h, oppP.onlineCount);
  h = fnvMix(h, oppP.handCount);
  h = fnvMix(h, oppP.dpTotal);
  for (const cid of oppP.dpSlot) {
    h = fnvMix(h, cid + 1);
  }
  h = fnvMix(h, oppP.offline.length);
  for (const cid of oppP.offline) {
    h = fnvMix(h, cid + 1);
  }
  h = fnvMix(h, oppP.koCount);
  if (oppP.battleDigimon) {
    h = fnvMix(h, oppP.battleDigimon.cardId + 1);
    h = fnvMix(h, oppP.battleDigimon.currentHp);
    h = fnvMix(h, specialtyToCode(oppP.battleDigimon.effectiveSpecialty));
    h = fnvMix(h, oppP.battleDigimon.stack.length);
  } else {
    h = fnvMix(h, 0);
  }

  // Own chosen attack in battle (never opponent's hidden attack)
  if (visible.battle) {
    h = fnvMix(h, visible.battle.firstAttacker === 'player' ? 1 : 2);
    h = fnvMix(h, slotToCode(visible.battle.chosenAttacks[side]));
    h = fnvMix(h, visible.battle.supportCards[side]?.cardId ?? 0);
  }

  return h >>> 0 || 0x12345678;
}

// Pre-bucketed cards by specialty and level for fast determinization of unseen zones
const ROOKIES_BY_SPEC: Record<Specialty, CardId[]> = {
  Fire: [],
  Ice: [],
  Nature: [],
  Darkness: [],
  Rare: [],
};
const CHAMPIONS_BY_SPEC: Record<Specialty, CardId[]> = {
  Fire: [],
  Ice: [],
  Nature: [],
  Darkness: [],
  Rare: [],
};
const ULTIMATES_BY_SPEC: Record<Specialty, CardId[]> = {
  Fire: [],
  Ice: [],
  Nature: [],
  Darkness: [],
  Rare: [],
};
const SUPPORT_OPTIONS: CardId[] = [];

for (const card of ALL_CARDS) {
  if (card.kind === 'Digimon' && card.specialty) {
    if (card.level === 'R') {
      ROOKIES_BY_SPEC[card.specialty].push(card.id);
    } else if (card.level === 'C') {
      CHAMPIONS_BY_SPEC[card.specialty].push(card.id);
    } else if (card.level === 'U') {
      ULTIMATES_BY_SPEC[card.specialty].push(card.id);
    }
  } else if (card.kind === 'Option' && isBattleSupportOption(card.id)) {
    SUPPORT_OPTIONS.push(card.id);
  }
}

/**
 * Infers a player's primary specialty from their publicly visible cards
 * (or own hand if `targetSide === viewer`).
 */
export function inferPlayerSpecialty(
  visible: VisibleMatchState,
  targetSide: PlayerSide,
): Specialty {
  const p = visible.players[targetSide];
  if (p.battleDigimon?.effectiveSpecialty) {
    return p.battleDigimon.effectiveSpecialty;
  }
  const counts: Record<Specialty, number> = {
    Fire: 0,
    Ice: 0,
    Nature: 0,
    Darkness: 0,
    Rare: 0,
  };
  const inspectIds = [
    ...(targetSide === visible.viewer ? p.hand : []),
    ...p.dpSlot,
    ...p.offline,
  ];
  for (const id of inspectIds) {
    const card = getCardById(id);
    if (card?.specialty) {
      counts[card.specialty] += 1;
    }
  }
  let bestSpec: Specialty = 'Fire';
  let bestCount = -1;
  for (const spec of ['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'] as const) {
    if (counts[spec] > bestCount) {
      bestCount = counts[spec];
      bestSpec = spec;
    }
  }
  return bestSpec;
}

/**
 * Builds a deterministic list of plausible unseen cards of length `count`
 * using ONLY `visible` state and `seed`. Ensures plenty of Rookies so simulated
 * draws never falsely fail Rookie checks.
 */
export function buildDeterminizedCardList(
  visible: VisibleMatchState,
  targetSide: PlayerSide,
  count: number,
  seed: number,
): CardId[] {
  if (count <= 0) return [];
  const spec = inferPlayerSpecialty(visible, targetSide);
  const rookies = ROOKIES_BY_SPEC[spec].length > 0 ? ROOKIES_BY_SPEC[spec] : ROOKIES_BY_SPEC.Fire;
  const champs =
    CHAMPIONS_BY_SPEC[spec].length > 0 ? CHAMPIONS_BY_SPEC[spec] : CHAMPIONS_BY_SPEC.Fire;
  const ults =
    ULTIMATES_BY_SPEC[spec].length > 0 ? ULTIMATES_BY_SPEC[spec] : ULTIMATES_BY_SPEC.Fire;

  const result: CardId[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const step = nextRng(s);
    s = step.nextSeed;
    const roll = i % 5;
    if (roll === 0 || roll === 1 || roll === 2) {
      // 60% Rookies so any post-KO redraw in simulation immediately finds a Rookie
      const idx = Math.floor(step.value * rookies.length);
      result.push(rookies[idx]!);
    } else if (roll === 3) {
      const idx = Math.floor(step.value * champs.length);
      result.push(champs[idx]!);
    } else if (i % 10 === 4 && SUPPORT_OPTIONS.length > 0) {
      const idx = Math.floor(step.value * SUPPORT_OPTIONS.length);
      result.push(SUPPORT_OPTIONS[idx]!);
    } else {
      const idx = Math.floor(step.value * ults.length);
      result.push(ults[idx]!);
    }
  }
  return result;
}

export interface SanitizedAiContext {
  visible: VisibleMatchState;
  sanitizedState: MatchState;
  legalActions: Action[];
  seed: number;
}

/**
 * Creates a completely fair, information-hidden `SanitizedAiContext` for `side`.
 * Overwrites `online` decks, opponent's `hand`, opponent's hidden `chosenAttacks` /
 * `supportCards`, `events`, and `rngSeed` using ONLY information visible to `side`.
 */
export function createSanitizedAiContext(
  rawState: MatchState,
  side: PlayerSide,
): SanitizedAiContext {
  const oppSide = otherSide(side);
  const visible = getVisibleState(rawState, side);
  const addedDp = hasAddedDpThisTurn(rawState, side);
  const seed = computeVisibleStateSeed(visible, side, addedDp);

  const turnStarter = getTurnStarter(rawState);
  const firstPlayer: PlayerSide =
    rawState.turnNumber % 2 === 1 ? turnStarter : otherSide(turnStarter);

  const sanitizedEvents: GameEvent[] = [
    {
      type: 'matchStarted',
      firstPlayer,
      seed: 1,
    },
  ];

  for (const pSide of ['player', 'opponent'] as const) {
    if (hasSideEnteredDigivolveOnTurn(rawState.events, rawState.turnNumber, pSide)) {
      sanitizedEvents.push({
        type: 'phaseChanged',
        phase: 'digivolve',
        activePlayer: pSide,
        turnNumber: rawState.turnNumber,
      });
    }
  }

  if (addedDp) {
    sanitizedEvents.push({
      type: 'dpCardAdded',
      side,
      cardId: 0,
      plusP: 0,
      newDpTotal: visible.players[side].dpTotal,
    });
  }

  const selfVis = visible.players[side];
  const oppVis = visible.players[oppSide];

  const selfOnline = buildDeterminizedCardList(
    visible,
    side,
    selfVis.onlineCount,
    (seed ^ 0x13579bdf) >>> 0,
  );
  const oppOnline = buildDeterminizedCardList(
    visible,
    oppSide,
    oppVis.onlineCount,
    (seed ^ 0x2468ace0) >>> 0,
  );
  const oppHand = buildDeterminizedCardList(
    visible,
    oppSide,
    oppVis.handCount,
    (seed ^ 0xdeadbeef) >>> 0,
  );

  const sanitizedState: MatchState = {
    players: {
      player:
        side === 'player'
          ? {
              online: selfOnline,
              hand: [...selfVis.hand],
              battleDigimon: selfVis.battleDigimon ? structuredClone(selfVis.battleDigimon) : null,
              dpSlot: [...selfVis.dpSlot],
              dpTotal: selfVis.dpTotal,
              offline: [...selfVis.offline],
              koCount: selfVis.koCount,
              activeDigivolveModifier: selfVis.activeDigivolveModifier
                ? structuredClone(selfVis.activeDigivolveModifier)
                : null,
            }
          : {
              online: oppOnline,
              hand: oppHand,
              battleDigimon: oppVis.battleDigimon ? structuredClone(oppVis.battleDigimon) : null,
              dpSlot: [...oppVis.dpSlot],
              dpTotal: oppVis.dpTotal,
              offline: [...oppVis.offline],
              koCount: oppVis.koCount,
              activeDigivolveModifier: oppVis.activeDigivolveModifier
                ? structuredClone(oppVis.activeDigivolveModifier)
                : null,
            },
      opponent:
        side === 'opponent'
          ? {
              online: selfOnline,
              hand: [...selfVis.hand],
              battleDigimon: selfVis.battleDigimon ? structuredClone(selfVis.battleDigimon) : null,
              dpSlot: [...selfVis.dpSlot],
              dpTotal: selfVis.dpTotal,
              offline: [...selfVis.offline],
              koCount: selfVis.koCount,
              activeDigivolveModifier: selfVis.activeDigivolveModifier
                ? structuredClone(selfVis.activeDigivolveModifier)
                : null,
            }
          : {
              online: oppOnline,
              hand: oppHand,
              battleDigimon: oppVis.battleDigimon ? structuredClone(oppVis.battleDigimon) : null,
              dpSlot: [...oppVis.dpSlot],
              dpTotal: oppVis.dpTotal,
              offline: [...oppVis.offline],
              koCount: oppVis.koCount,
              activeDigivolveModifier: oppVis.activeDigivolveModifier
                ? structuredClone(oppVis.activeDigivolveModifier)
                : null,
            },
    },
    turnNumber: visible.turnNumber,
    activePlayer: visible.activePlayer,
    phase: visible.phase,
    mulliganDecided: visible.mulliganDecided ? { ...visible.mulliganDecided } : undefined,
    battle: visible.battle
      ? {
          firstAttacker: visible.battle.firstAttacker,
          defender: visible.battle.defender,
          chosenAttacks: {
            player:
              side === 'player'
                ? (visible.battle.chosenAttacks.player as AttackSlot | null)
                : visible.phase === 'supportSelect'
                  ? 'circle'
                  : null,
            opponent:
              side === 'opponent'
                ? (visible.battle.chosenAttacks.opponent as AttackSlot | null)
                : visible.phase === 'supportSelect'
                  ? 'circle'
                  : null,
          },
          effectiveAttacks: {
            player:
              side === 'player'
                ? (visible.battle.chosenAttacks.player as AttackSlot | null)
                : visible.phase === 'supportSelect'
                  ? 'circle'
                  : null,
            opponent:
              side === 'opponent'
                ? (visible.battle.chosenAttacks.opponent as AttackSlot | null)
                : visible.phase === 'supportSelect'
                  ? 'circle'
                  : null,
          },
          supportCards: {
            player:
              side === 'player' && visible.battle.supportCards.player
                ? { ...visible.battle.supportCards.player }
                : null,
            opponent:
              side === 'opponent' && visible.battle.supportCards.opponent
                ? { ...visible.battle.supportCards.opponent }
                : null,
          },
          supportDecided: visible.battle.supportDecided
            ? { ...visible.battle.supportDecided }
            : { player: false, opponent: false },
          computedPowers: { player: 0, opponent: 0 },
          grantedAbilities: { player: [], opponent: [] },
          abilityRemoved: { player: false, opponent: false },
          reviveOnKo: { player: null, opponent: null },
        }
      : null,
    winner: visible.winner,
    winReason: visible.winReason,
    events: sanitizedEvents,
    rngSeed: seed,
    config: { ...visible.config },
  };

  const legalActions = getLegalActions(sanitizedState, side);
  return {
    visible,
    sanitizedState,
    legalActions,
    seed,
  };
}

// ---------------------------------------------------------------------------
// 2. Battle Simulation & Combat Evaluation Helpers
// ---------------------------------------------------------------------------

export type SimulatedSupportChoice =
  | { kind: 'pass' }
  | { kind: 'hand'; handIndex: number; cardId: CardId }
  | { kind: 'deckTop'; cardId: CardId };

/**
 * Estimates the opponent's attack selection probabilities `(circle, triangle, x)`
 * based on their Active Digimon's printed attacks, `XEffect`, and turn order.
 */
export function estimateOpponentAttackDistribution(
  sanitizedState: MatchState,
  side: PlayerSide,
): Record<AttackSlot, number> {
  const oppSide = otherSide(side);
  const oppDigimon = sanitizedState.players[oppSide].battleDigimon;
  const myDigimon = sanitizedState.players[side].battleDigimon;

  if (!oppDigimon) {
    return { circle: 0.45, triangle: 0.35, x: 0.2 };
  }
  const oppCard = getCardById(oppDigimon.cardId);
  if (!oppCard?.attacks) {
    return { circle: 0.45, triangle: 0.35, x: 0.2 };
  }

  const turnStarter = sanitizedState.battle?.firstAttacker ?? getTurnStarter(sanitizedState);
  const oppIsFirst = turnStarter === oppSide;

  let wCircle = Math.max(80, oppCard.attacks.circle.power);
  let wTriangle = Math.max(80, oppCard.attacks.triangle.power);
  let wX = Math.max(60, oppCard.attacks.x.power);

  const xEff = oppCard.attacks.x.effect;
  if (xEff && myDigimon) {
    switch (xEff.type) {
      case 'foeX3':
        if (xEff.specialty === myDigimon.effectiveSpecialty) {
          wX = Math.max(wX, oppCard.attacks.x.power * 3 * 1.25);
        }
        break;
      case 'counter':
        // Counter only triggers if opponent attacks second and survives!
        if (!oppIsFirst && oppDigimon.currentHp > 300) {
          wX += 380;
        } else if (oppIsFirst) {
          wX = Math.max(30, oppCard.attacks.x.power * 0.5);
        }
        break;
      case 'zero':
        wX += 260;
        break;
      case 'firstAttack':
        if (!oppIsFirst) wX += 220;
        break;
      case 'eatUpHp':
        wX += 180;
        break;
      case 'crash':
        if (oppDigimon.currentHp >= myDigimon.currentHp) {
          wX += oppDigimon.currentHp * 0.85;
        }
        break;
      case 'jamming':
        wX += 120;
        break;
    }
  }

  const total = wCircle + wTriangle + wX;
  if (total <= 0) {
    return { circle: 0.45, triangle: 0.35, x: 0.2 };
  }
  return {
    circle: wCircle / total,
    triangle: wTriangle / total,
    x: wX / total,
  };
}

/**
 * Simulates a single battle resolution on a fast clone of `sanitizedState`
 * and returns a scalar utility score from `side`'s perspective.
 */
export function simulateSingleBattleUtility(
  sanitizedState: MatchState,
  side: PlayerSide,
  mySlot: AttackSlot,
  oppSlot: AttackSlot,
  mySupport: SimulatedSupportChoice,
  oppSupportCard?: SupportSlotCard | null,
): number {
  const oppSide = otherSide(side);
  const myBefore = sanitizedState.players[side];
  const oppBefore = sanitizedState.players[oppSide];

  if (!myBefore.battleDigimon || !oppBefore.battleDigimon) {
    return 0;
  }

  const myHpBefore = myBefore.battleDigimon.currentHp;
  const oppHpBefore = oppBefore.battleDigimon.currentHp;
  const myLevelRank = getLevelRank(getCardById(myBefore.battleDigimon.cardId)?.level);
  const oppLevelRank = getLevelRank(getCardById(oppBefore.battleDigimon.cardId)?.level);

  const turnStarter = sanitizedState.battle?.firstAttacker ?? getTurnStarter(sanitizedState);

  const clonePlayer = (p: typeof myBefore) => ({
    online: [...p.online],
    hand: [...p.hand],
    battleDigimon: p.battleDigimon
      ? {
          cardId: p.battleDigimon.cardId,
          stack: [...p.battleDigimon.stack],
          currentHp: p.battleDigimon.currentHp,
          maxHp: p.battleDigimon.maxHp,
          effectiveSpecialty: p.battleDigimon.effectiveSpecialty,
        }
      : null,
    dpSlot: [...p.dpSlot],
    dpTotal: p.dpTotal,
    offline: [...p.offline],
    koCount: p.koCount,
    activeDigivolveModifier: null,
  });

  const sim: MatchState = {
    players: {
      player: clonePlayer(sanitizedState.players.player),
      opponent: clonePlayer(sanitizedState.players.opponent),
    },
    turnNumber: sanitizedState.turnNumber,
    activePlayer: turnStarter,
    phase: 'battleResolve',
    battle: {
      firstAttacker: turnStarter,
      defender: otherSide(turnStarter),
      chosenAttacks: {
        player: side === 'player' ? mySlot : oppSlot,
        opponent: side === 'opponent' ? mySlot : oppSlot,
      },
      effectiveAttacks: {
        player: side === 'player' ? mySlot : oppSlot,
        opponent: side === 'opponent' ? mySlot : oppSlot,
      },
      supportCards: {
        player: null,
        opponent: null,
      },
      supportDecided: { player: true, opponent: true },
      computedPowers: { player: 0, opponent: 0 },
      grantedAbilities: { player: [], opponent: [] },
      abilityRemoved: { player: false, opponent: false },
      reviveOnKo: { player: null, opponent: null },
    },
    winner: null,
    events: [],
    rngSeed: sanitizedState.rngSeed,
    config: sanitizedState.config,
  };

  if (mySupport.kind === 'hand') {
    const handArr = sim.players[side].hand;
    if (mySupport.handIndex >= 0 && mySupport.handIndex < handArr.length) {
      handArr.splice(mySupport.handIndex, 1);
    }
    sim.battle!.supportCards[side] = {
      cardId: mySupport.cardId,
      source: 'hand',
    };
  } else if (mySupport.kind === 'deckTop') {
    if (sim.players[side].online.length > 0) {
      sim.players[side].online.shift();
    }
    sim.battle!.supportCards[side] = {
      cardId: mySupport.cardId,
      source: 'deckTop',
    };
  }

  if (oppSupportCard) {
    sim.battle!.supportCards[oppSide] = { ...oppSupportCard };
  }

  resolveBattle(sim);

  const myAfter = sim.players[side];
  const oppAfter = sim.players[oppSide];

  let score = 0;

  // 1. Match win / loss check (3rd KO)
  if (sim.winner === side) {
    score += 12000;
  } else if (sim.winner === oppSide) {
    score -= 12000;
  }

  // 2. KO points & stack loss evaluation
  const weScoredKo = myAfter.koCount > myBefore.koCount;
  const oppScoredKo = oppAfter.koCount > oppBefore.koCount;

  if (weScoredKo) {
    // Reward KO'ing higher-level opponent Digimon even more
    score += 2200 + oppLevelRank * 450;
  }
  if (oppScoredKo) {
    // Losing our evolved Digimon is very costly
    score -= 2300 + myLevelRank * 500;
  }

  // 3. Remaining HP & damage differential
  const myHpAfter = myAfter.battleDigimon?.currentHp ?? 0;
  const oppHpAfter = oppAfter.battleDigimon?.currentHp ?? 0;

  const oppDamageTaken = oppHpBefore - oppHpAfter;
  const myDamageTaken = myHpBefore - myHpAfter;

  score += oppDamageTaken * 1.65;
  score -= myDamageTaken * 1.55;
  score += (myHpAfter - oppHpAfter) * 0.45;

  // 4. Card advantage, DP slot & Deck-Out effects from Support cards
  const expectedMyHandWithoutEffect =
    mySupport.kind === 'hand' ? Math.max(0, myBefore.hand.length - 1) : myBefore.hand.length;
  const myHandGain = myAfter.hand.length - expectedMyHandWithoutEffect;
  const oppHandGain = oppAfter.hand.length - oppBefore.hand.length;

  score += myHandGain * 115;
  score -= oppHandGain * 115;

  const myDpDelta = myAfter.dpTotal - myBefore.dpTotal;
  const oppDpDelta = oppAfter.dpTotal - oppBefore.dpTotal;
  score += myDpDelta * 14;
  score -= oppDpDelta * 14;

  // Check if a devolve effect happened on either side during battle
  if (oppAfter.battleDigimon && oppBefore.battleDigimon) {
    const newOppRank = getLevelRank(getCardById(oppAfter.battleDigimon.cardId)?.level);
    if (newOppRank < oppLevelRank) {
      score += (oppLevelRank - newOppRank) * 650;
    }
  }
  if (myAfter.battleDigimon && myBefore.battleDigimon) {
    const newMyRank = getLevelRank(getCardById(myAfter.battleDigimon.cardId)?.level);
    if (newMyRank < myLevelRank) {
      score -= (myLevelRank - newMyRank) * 650;
    }
  }

  // Online deck delta & next-turn Draw Phase deck-out check
  const myNeededDrawNext = Math.max(0, 4 - myAfter.hand.length);
  const oppNeededDrawNext = Math.max(0, 4 - oppAfter.hand.length);

  if (sim.winner === null) {
    if (myAfter.online.length === 0 || (myNeededDrawNext > 0 && myAfter.online.length < myNeededDrawNext)) {
      score -= 8000;
    } else if (myAfter.online.length <= 4) {
      score -= (5 - myAfter.online.length) * 250;
    }

    if (oppAfter.online.length === 0 || (oppNeededDrawNext > 0 && oppAfter.online.length < oppNeededDrawNext)) {
      score += 7500;
    }
  }

  const myOnlineDelta = myAfter.online.length - myBefore.online.length;
  const oppOnlineDelta = oppAfter.online.length - oppBefore.online.length;
  score += myOnlineDelta * 22;
  score -= oppOnlineDelta * 25;

  return score;
}

/**
 * Computes the strategic cost of spending `card` from `hand` as a Battle Support card,
 * accounting for evolution pieces in hand, backup Rookie needs, and remaining deck size.
 */
export function computeSupportCardOpportunityCost(
  sanitizedState: MatchState,
  side: PlayerSide,
  handIndex: number,
): number {
  const player = sanitizedState.players[side];
  const cardId = player.hand[handIndex];
  if (cardId === undefined) return 80;
  const card = getCardById(cardId);
  if (!card) return 80;

  // Base threshold so we don't waste cards when outcome is unchanged
  let cost = 75;

  // Deck-thinning penalty increases when Online Deck is getting low
  if (player.online.length <= 5) {
    cost += 450;
  } else if (player.online.length <= 10) {
    cost += 120;
  }

  if (card.kind === 'Digimon') {
    const active = player.battleDigimon;
    const activeCard = active ? getCardById(active.cardId) : undefined;

    // Check if this card is a direct evolution target for our active Digimon
    if (active && activeCard) {
      const isArmorTarget =
        activeCard.level === 'R P' &&
        card.level === 'A' &&
        Boolean(ARMOR_LINEAGE[activeCard.id]?.includes(card.id));
      const isNextLevelMatch =
        card.specialty === active.effectiveSpecialty &&
        (((activeCard.level === 'R' || activeCard.level === 'R P') && card.level === 'C') ||
          (activeCard.level === 'C' && card.level === 'U'));

      if (isArmorTarget) {
        cost += 340;
      } else if (isNextLevelMatch) {
        // Count how many copies of this evolution level/specialty we have in hand
        const duplicateCount = player.hand.filter((id) => {
          const c = getCardById(id);
          return c && c.kind === 'Digimon' && c.level === card.level && c.specialty === card.specialty;
        }).length;
        cost += duplicateCount > 1 ? 110 : 300;
      }
    }

    // Check if this is our ONLY Rookie in hand while our active Digimon might be KO'd
    if (card.level === 'R' || card.level === 'R P') {
      const rookieCount = player.hand.filter((id) => isRookieCard(id)).length;
      if (rookieCount <= 1 && (!active || active.currentHp <= 650)) {
        cost += 260;
      } else if (card.level === 'R P') {
        cost += 140;
      }
    }

    // High +P value cards are useful for DP banking if we aren't at Ultimate yet
    if (activeCard && activeCard.level !== 'U' && card.plusP >= 20) {
      cost += card.plusP * 2.5;
    }
  }

  return cost;
}

// ---------------------------------------------------------------------------
// 3. Normal AI Phase Heuristics
// ---------------------------------------------------------------------------

/**
 * Scores a Rookie card for placement into the Battle Slot.
 */
export function scoreRookieForPlacement(
  sanitizedState: MatchState,
  side: PlayerSide,
  handIndex: number,
): number {
  const player = sanitizedState.players[side];
  const oppSide = otherSide(side);
  const oppActive = sanitizedState.players[oppSide].battleDigimon;

  const cardId = player.hand[handIndex];
  if (cardId === undefined) return -9999;
  const card = getCardById(cardId);
  if (!card || !isRookieCard(cardId)) return -9999;

  let score = card.hp * 1.15;
  if (card.attacks) {
    score +=
      card.attacks.circle.power * 0.95 +
      card.attacks.triangle.power * 0.7 +
      card.attacks.x.power * 0.45;
  }

  // Partner Rookie bonus (especially if matching Armor is in hand)
  if (card.level === 'R P') {
    score += 120;
    const armors = ARMOR_LINEAGE[card.id] ?? [];
    const hasMatchingArmorInHand = player.hand.some((id) => armors.includes(id));
    if (hasMatchingArmorInHand) {
      score += 650;
    }
  }

  // Check matching Champion / Ultimate evolutions in hand
  for (let i = 0; i < player.hand.length; i++) {
    if (i === handIndex) continue;
    const other = getCardById(player.hand[i]!);
    if (!other || other.kind !== 'Digimon') continue;
    if (other.specialty === card.specialty) {
      if (other.level === 'C') {
        score += 380;
        if (player.dpTotal + 20 >= other.dp) {
          score += 180;
        }
      } else if (other.level === 'U') {
        score += 150;
      }
    }
  }

  // Check matchup against Opponent's Active Digimon if present
  if (oppActive) {
    const oppCard = getCardById(oppActive.cardId);
    const myXEff = card.attacks?.x.effect;
    if (myXEff?.type === 'foeX3' && myXEff.specialty === oppActive.effectiveSpecialty) {
      score += 350;
    }
    const oppXEff = oppCard?.attacks?.x.effect;
    if (oppXEff?.type === 'foeX3' && oppXEff.specialty === card.specialty) {
      score -= 400;
    }
  }

  // Slight preference to keep higher +P cards in hand for DP Slot if stats are otherwise tied
  score -= card.plusP * 1.5;

  return score;
}

/**
 * Checks if `player` has a Digimon in hand that would become digivolvable if `optionCardId` is played.
 */
function isDigivolveOptionUsefulNow(
  sanitizedState: MatchState,
  side: PlayerSide,
  optionHandIndex: number,
): boolean {
  const player = sanitizedState.players[side];
  const active = player.battleDigimon;
  if (!active) return false;
  const activeCard = getCardById(active.cardId);
  if (!activeCard) return false;

  const optionId = player.hand[optionHandIndex];
  if (optionId === undefined || !isDigivolvePhaseOption(optionId)) return false;

  const otherDigimonInHand: CardData[] = [];
  for (let i = 0; i < player.hand.length; i++) {
    if (i === optionHandIndex) continue;
    const c = getCardById(player.hand[i]!);
    if (c && c.kind === 'Digimon') {
      otherDigimonInHand.push(c);
    }
  }

  switch (optionId) {
    case 293: // Download Digivolve (ignoreSpecialty, ignoreLevel, ignoreDp)
      return otherDigimonInHand.some(
        (c) =>
          getLevelRank(c.level) > getLevelRank(activeCard.level) ||
          (c.hp > active.currentHp + 200 && getLevelRank(c.level) >= getLevelRank(activeCard.level)),
      );
    case 294: // ArmorCrush Digivolve (A -> C/U matching specialty, requires DP)
      return (
        activeCard.level === 'A' &&
        otherDigimonInHand.some(
          (c) =>
            (c.level === 'C' || c.level === 'U') &&
            c.specialty === active.effectiveSpecialty &&
            player.dpTotal >= c.dp,
        )
      );
    case 295: // Special Digivolve (ignoreSpecialty, extraDp +20)
      return otherDigimonInHand.some((c) => {
        const nextLevelOk =
          ((activeCard.level === 'R' || activeCard.level === 'R P') && c.level === 'C') ||
          (activeCard.level === 'C' && c.level === 'U');
        return nextLevelOk && player.dpTotal + 20 >= c.dp;
      });
    case 296: // Mutant Digivolve (same level, ignoreSpecialty, requires DP)
      return (
        active.currentHp < active.maxHp * 0.55 &&
        otherDigimonInHand.some(
          (c) => c.level === activeCard.level && player.dpTotal >= c.dp && c.hp > active.currentHp + 250,
        )
      );
    case 297: // Warp Digivolve (R/R P -> U matching specialty, requires DP)
      return (
        (activeCard.level === 'R' || activeCard.level === 'R P') &&
        otherDigimonInHand.some(
          (c) =>
            c.level === 'U' &&
            c.specialty === active.effectiveSpecialty &&
            player.dpTotal >= c.dp,
        )
      );
    case 298: {
      // De-Armor Digivolve (A -> underlying R/R P)
      if (activeCard.level !== 'A' || active.stack.length === 0) return false;
      const under = getCardById(active.stack[active.stack.length - 1]!);
      return Boolean(under && active.currentHp < under.hp * 0.6);
    }
    case 299: // Speed Digivolve (ignoreDp)
      return otherDigimonInHand.some((c) => {
        const nextLevelOk =
          ((activeCard.level === 'R' || activeCard.level === 'R P') && c.level === 'C') ||
          (activeCard.level === 'C' && c.level === 'U');
        return (
          nextLevelOk &&
          c.specialty === active.effectiveSpecialty &&
          (player.dpTotal < c.dp || player.dpTotal >= 30)
        );
      });
    case 300: {
      // Digi-devolve (U->C or C->R, doubles revealed HP)
      if (active.stack.length === 0) return false;
      const under = getCardById(active.stack[active.stack.length - 1]!);
      return Boolean(under && active.currentHp <= 280 && under.hp * 2 > active.currentHp + 350);
    }
    default:
      return false;
  }
}

/**
 * Scores a candidate `addToDp` action in `digivolve` phase for Normal AI.
 */
function scoreAddToDpAction(
  sanitizedState: MatchState,
  side: PlayerSide,
  handIndex: number,
): number {
  const player = sanitizedState.players[side];
  const active = player.battleDigimon;
  const activeCard = active ? getCardById(active.cardId) : undefined;
  const cardId = player.hand[handIndex];
  if (cardId === undefined) return -9999;
  const card = getCardById(cardId);
  if (!card || card.kind !== 'Digimon' || card.level === 'A') return -9999;

  // If our Active Digimon is already an Ultimate and we don't need DP, avoid wasting cards
  if (activeCard?.level === 'U' && player.dpTotal >= 30) {
    return -200;
  }

  let score = card.plusP * 12;

  // Check if other cards in hand are evolution targets for our Active Digimon
  if (active && activeCard) {
    const isThisCardNeededEvolution =
      card.specialty === active.effectiveSpecialty &&
      (((activeCard.level === 'R' || activeCard.level === 'R P') && card.level === 'C') ||
        (activeCard.level === 'C' && card.level === 'U'));

    if (isThisCardNeededEvolution) {
      const sameEvoCount = player.hand.filter((id) => {
        const c = getCardById(id);
        return c && c.kind === 'Digimon' && c.level === card.level && c.specialty === card.specialty;
      }).length;
      if (sameEvoCount <= 1) {
        // Don't sacrifice our only evolution piece!
        score -= 700;
      }
    }

    // Check if adding this card's +P unlocks an evolution in ANOTHER hand slot right now!
    for (let i = 0; i < player.hand.length; i++) {
      if (i === handIndex) continue;
      const other = getCardById(player.hand[i]!);
      if (!other || other.kind !== 'Digimon') continue;
      const otherIsNextEvo =
        other.specialty === active.effectiveSpecialty &&
        (((activeCard.level === 'R' || activeCard.level === 'R P') && other.level === 'C') ||
          (activeCard.level === 'C' && other.level === 'U'));
      if (otherIsNextEvo) {
        if (player.dpTotal < other.dp && player.dpTotal + card.plusP >= other.dp) {
          score += 650; // Unlocks immediate digivolution this turn!
        } else if (player.dpTotal < other.dp) {
          score += 180;
        }
      }
    }
  }

  // Avoid sacrificing our only Rookie if our Active Digimon is low on HP
  if (card.level === 'R' || card.level === 'R P') {
    const rookieCount = player.hand.filter((id) => isRookieCard(id)).length;
    if (rookieCount <= 1 && (!active || active.currentHp <= 450)) {
      score -= 320;
    }
    if (card.level === 'R P') {
      score -= 150;
    }
  }

  // Prefer sacrificing off-specialty Champions/Ultimates that can't evolve onto our line
  if (active && card.specialty !== active.effectiveSpecialty && (card.level === 'C' || card.level === 'U')) {
    score += 140;
  }

  return score;
}

/**
 * Normal AI: Smart tactical heuristic player.
 */
export function chooseNormalAction(state: MatchState, side: PlayerSide): Action {
  const { sanitizedState, legalActions } = createSanitizedAiContext(state, side);
  if (legalActions.length === 0) {
    throw new Error(`No legal actions available for '${side}' in phase '${sanitizedState.phase}'.`);
  }
  if (legalActions.length === 1) {
    return legalActions[0]!;
  }

  const player = sanitizedState.players[side];

  switch (sanitizedState.phase) {
    case 'mulligan': {
      // Keep hand if it has a good Rookie (Partner Rookie, high HP >= 500, matching evolution in hand, or >= 2 Rookies)
      const rookies = player.hand
        .map((id) => getCardById(id))
        .filter((c): c is CardData => Boolean(c && (c.level === 'R' || c.level === 'R P')));

      const hasGoodRookie = rookies.some((r) => {
        if (r.level === 'R P') return true;
        if (r.hp >= 500) return true;
        const hasEvoInHand = player.hand.some((id) => {
          const c = getCardById(id);
          return c && c.kind === 'Digimon' && c.level === 'C' && c.specialty === r.specialty;
        });
        return hasEvoInHand;
      });

      const keep = hasGoodRookie || rookies.length >= 2;
      const match = legalActions.find((a) => a.type === 'mulligan' && a.keep === keep);
      return match ?? legalActions[0]!;
    }

    case 'rookiePlacement': {
      let bestAction = legalActions[0]!;
      let bestScore = -Infinity;
      for (const action of legalActions) {
        if (action.type !== 'placeRookie') continue;
        const s = scoreRookieForPlacement(sanitizedState, side, action.handIndex);
        if (s > bestScore) {
          bestScore = s;
          bestAction = action;
        }
      }
      return bestAction;
    }

    case 'digivolve': {
      const active = player.battleDigimon;
      const activeCard = active ? getCardById(active.cardId) : undefined;

      // 1. Prioritize Armor Digivolve (0 DP, keeps DP Slot intact!)
      const armorActions = legalActions.filter(
        (a): a is Extract<Action, { type: 'armorDigivolve' }> => a.type === 'armorDigivolve',
      );
      if (armorActions.length > 0) {
        armorActions.sort((a, b) => {
          const ca = getCardById(player.hand[a.handIndex]!);
          const cb = getCardById(player.hand[b.handIndex]!);
          return (cb?.hp ?? 0) - (ca?.hp ?? 0);
        });
        return armorActions[0]!;
      }

      // 2. Normal / Option-modified Digivolve (do BEFORE addToDp so existing DP is used before banking new DP!)
      const digiActions = legalActions.filter(
        (a): a is Extract<Action, { type: 'digivolve' }> => a.type === 'digivolve',
      );
      if (digiActions.length > 0 && active && activeCard) {
        let bestDigi: Action | null = null;
        let bestDigiScore = -Infinity;
        for (const act of digiActions) {
          const toCard = getCardById(player.hand[act.handIndex]!);
          if (!toCard) continue;
          const fromRank = getLevelRank(activeCard.level);
          const toRank = getLevelRank(toCard.level);
          // Only digivolve if level increases, or if HP increases significantly when damaged
          if (toRank > fromRank || toCard.hp > active.currentHp + 150) {
            const s =
              toRank * 600 +
              toCard.hp +
              (toCard.attacks?.circle.power ?? 0) * 0.8 +
              (toCard.attacks?.triangle.power ?? 0) * 0.5;
            if (s > bestDigiScore) {
              bestDigiScore = s;
              bestDigi = act;
            }
          }
        }
        if (bestDigi) {
          return bestDigi;
        }
      }

      // 3. Use Digivolve Option if it immediately enables a beneficial evolution
      const optActions = legalActions.filter(
        (a): a is Extract<Action, { type: 'useDigivolveOption' }> => a.type === 'useDigivolveOption',
      );
      for (const act of optActions) {
        if (isDigivolveOptionUsefulNow(sanitizedState, side, act.handIndex)) {
          return act;
        }
      }

      // 4. Add a card to DP Slot if beneficial
      const dpActions = legalActions.filter(
        (a): a is Extract<Action, { type: 'addToDp' }> => a.type === 'addToDp',
      );
      if (dpActions.length > 0) {
        let bestDpAction: Action | null = null;
        let bestDpScore = 0; // Require positive utility to sacrifice a card to DP
        for (const act of dpActions) {
          const s = scoreAddToDpAction(sanitizedState, side, act.handIndex);
          if (s > bestDpScore) {
            bestDpScore = s;
            bestDpAction = act;
          }
        }
        if (bestDpAction) {
          return bestDpAction;
        }
      }

      // 5. End Digivolve Phase
      const endAct = legalActions.find((a) => a.type === 'endDigivolvePhase');
      return endAct ?? legalActions[0]!;
    }

    case 'attackSelect': {
      const oppDist = estimateOpponentAttackDistribution(sanitizedState, side);
      let bestAction = legalActions[0]!;
      let bestExpectedScore = -Infinity;

      for (const action of legalActions) {
        if (action.type !== 'chooseAttack') continue;
        const mySlot = action.slot;
        let expected = 0;
        for (const oppSlot of ATTACK_SLOTS) {
          const u = simulateSingleBattleUtility(sanitizedState, side, mySlot, oppSlot, {
            kind: 'pass',
          });
          expected += oppDist[oppSlot] * u;
        }
        if (expected > bestExpectedScore) {
          bestExpectedScore = expected;
          bestAction = action;
        }
      }
      return bestAction;
    }

    case 'supportSelect': {
      const mySlot: AttackSlot =
        (sanitizedState.battle?.chosenAttacks[side] as AttackSlot | null) ?? 'circle';
      const oppDist = estimateOpponentAttackDistribution(sanitizedState, side);

      const evalSupportChoice = (choice: SimulatedSupportChoice): number => {
        let expected = 0;
        for (const oppSlot of ATTACK_SLOTS) {
          expected +=
            oppDist[oppSlot] *
            simulateSingleBattleUtility(sanitizedState, side, mySlot, oppSlot, choice);
        }
        return expected;
      };

      const passScore = evalSupportChoice({ kind: 'pass' });
      let bestAction: Action =
        legalActions.find((a) => a.type === 'passSupport') ?? legalActions[0]!;
      let bestNetScore = passScore;

      // Evaluate each playable hand card
      for (const action of legalActions) {
        if (action.type !== 'playSupportFromHand') continue;
        const cardId = player.hand[action.handIndex];
        if (cardId === undefined) continue;
        // Skip cards whose support effect is 'none'
        const eff = getCardEffect(cardId);
        if (eff.ops.length === 0 || (eff.ops.length === 1 && eff.ops[0]?.op === 'none')) {
          continue;
        }
        const rawScore = evalSupportChoice({
          kind: 'hand',
          handIndex: action.handIndex,
          cardId,
        });
        const keepCost = computeSupportCardOpportunityCost(
          sanitizedState,
          side,
          action.handIndex,
        );
        const netScore = rawScore - keepCost;
        if (netScore > bestNetScore) {
          bestNetScore = netScore;
          bestAction = action;
        }
      }

      // If no hand support was chosen and the battle is close/unfavorable, consider blind top-deck support
      if (bestAction.type === 'passSupport' && player.online.length > 8) {
        const deckTopAction = legalActions.find((a) => a.type === 'playSupportFromDeckTop');
        if (deckTopAction && passScore < 300 && passScore > -3500) {
          // Sample first 3 determinized cards in online deck to estimate blind support value
          const sampleCount = Math.min(3, player.online.length);
          let sumDeckTop = 0;
          for (let i = 0; i < sampleCount; i++) {
            sumDeckTop += evalSupportChoice({
              kind: 'deckTop',
              cardId: player.online[i]!,
            });
          }
          const avgDeckTop = sumDeckTop / sampleCount - 55;
          if (avgDeckTop > bestNetScore) {
            bestAction = deckTopAction;
          }
        }
      }

      return bestAction;
    }

    default:
      return legalActions[0]!;
  }
}
