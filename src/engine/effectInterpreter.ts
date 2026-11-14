/**
 * Effect DSL Interpreter for Digimon Digital Card Battle (PS1).
 * Evaluates StatRef, ValueExpr, Condition, and executes every EffectOp
 * according to docs/EFFECT_DSL.md and docs/RULES.md.
 */

import { getCardById } from '../data/cards';
import { EFFECT_REGISTRY } from '../data/effects';
import type {
  AttackSlot,
  AttackSlotSel,
  CardData,
  CardEffectDef,
  CardFilter,
  CardId,
  Cmp,
  Condition,
  CountExpr,
  EffectOp,
  EffectRegistry,
  GrantedAbility,
  Level,
  MatchState,
  NumMode,
  PlayerSide,
  Selection,
  Specialty,
  StatRef,
  Target,
  ValueExpr,
  Who,
} from '../types/game';
import { pickRandomIndices, pickWeightedIndex, shuffleInPlace } from './rng';

export const MIN_HP_FROM_EFFECTS = 10;
export const MIN_ATTACK_POWER = 0;
export const MAX_STAT_VALUE = 9990;

export interface EffectExecContext {
  state: MatchState;
  userSide: PlayerSide;
  /** Per-slot attack powers for both sides during battle resolution. */
  slotPowers: Record<PlayerSide, Record<AttackSlot, number>>;
  /** Explicit attack order override applied by attackFirst / attackSecond ops. */
  attackOrderOverride: Record<PlayerSide, 'first' | 'second' | null>;
  /** Number of cards actually moved by the most recent card-moving op. */
  lastMovedCount: number;
  /** Optional custom or injected EffectRegistry. */
  effectRegistry?: EffectRegistry;
  /** Source card ID being executed. */
  sourceCardId?: CardId;
  /** Recursion depth guard for useTopCardSupport. */
  recursionDepth?: number;
}

export function otherSide(side: PlayerSide): PlayerSide {
  return side === 'player' ? 'opponent' : 'player';
}

export function resolveWho(userSide: PlayerSide, who: Who): PlayerSide {
  return who === 'self' ? userSide : otherSide(userSide);
}

export function resolveTargets(userSide: PlayerSide, target: Target): PlayerSide[] {
  if (target === 'self') return [userSide];
  if (target === 'opponent') return [otherSide(userSide)];
  return [userSide, otherSide(userSide)];
}

/**
 * Computes numeric level rank according to RULES.md Section 3.2:
 * 'R' -> 1, 'R P' -> 1, 'C' -> 2, 'A' -> 2, 'U' -> 3
 */
export function getLevelRank(level: Level | null | undefined): number {
  switch (level) {
    case 'R':
    case 'R P':
      return 1;
    case 'C':
    case 'A':
      return 2;
    case 'U':
      return 3;
    default:
      return 0;
  }
}

/**
 * Checks whether a card's printed `level` satisfies a `levelIs` list.
 * Per RULES.md: `'R P'` also satisfies `'R'` in effect conditions.
 */
export function matchesLevelList(cardLevel: Level | null | undefined, allowed: readonly Level[]): boolean {
  if (!cardLevel) return false;
  if (allowed.includes(cardLevel)) return true;
  if (cardLevel === 'R P' && allowed.includes('R')) return true;
  return false;
}

/**
 * Sums the `plusP` values of all cards currently in a DP slot.
 */
export function computeDpTotal(dpSlot: readonly CardId[]): number {
  let total = 0;
  for (const id of dpSlot) {
    const card = getCardById(id);
    if (card) total += card.plusP;
  }
  return total;
}

/**
 * Returns the currently effective attack slot for `side`.
 */
export function getEffectiveAttack(state: MatchState, side: PlayerSide): AttackSlot {
  if (state.battle) {
    const eff = state.battle.effectiveAttacks?.[side];
    if (eff) return eff;
    const chosen = state.battle.chosenAttacks[side];
    if (chosen) return chosen;
  }
  return 'circle';
}

/**
 * Initializes per-slot attack powers from both players' active Digimon.
 */
export function createInitialSlotPowers(
  state: MatchState,
): Record<PlayerSide, Record<AttackSlot, number>> {
  const result: Record<PlayerSide, Record<AttackSlot, number>> = {
    player: { circle: 0, triangle: 0, x: 0 },
    opponent: { circle: 0, triangle: 0, x: 0 },
  };

  for (const side of ['player', 'opponent'] as const) {
    const active = state.players[side].battleDigimon;
    if (!active) continue;
    const card = getCardById(active.cardId);
    if (!card?.attacks) continue;
    result[side] = {
      circle: card.attacks.circle.power,
      triangle: card.attacks.triangle.power,
      x: card.attacks.x.power,
    };
  }
  return result;
}

/**
 * Creates a fresh EffectExecContext for executing ops on `state`.
 */
export function createEffectExecContext(
  state: MatchState,
  userSide: PlayerSide,
  options?: {
    slotPowers?: Record<PlayerSide, Record<AttackSlot, number>>;
    attackOrderOverride?: Record<PlayerSide, 'first' | 'second' | null>;
    effectRegistry?: EffectRegistry;
    sourceCardId?: CardId;
  },
): EffectExecContext {
  return {
    state,
    userSide,
    slotPowers: options?.slotPowers ?? createInitialSlotPowers(state),
    attackOrderOverride: options?.attackOrderOverride ?? { player: null, opponent: null },
    lastMovedCount: 0,
    effectRegistry: options?.effectRegistry,
    sourceCardId: options?.sourceCardId,
    recursionDepth: 0,
  };
}

/**
 * Synchronizes `state.battle.computedPowers` with `ctx.slotPowers` and `effectiveAttacks`.
 */
export function syncComputedPowers(ctx: EffectExecContext): void {
  const { state, slotPowers } = ctx;
  if (!state.battle) return;
  for (const side of ['player', 'opponent'] as const) {
    const slot = getEffectiveAttack(state, side);
    state.battle.computedPowers[side] = slotPowers[side][slot];
  }
}

/**
 * Applies a numeric arithmetic operation with DDCB rounding and floor/ceiling rules:
 * - Division floors to the nearest multiple of 10: floor((S / V) / 10) * 10
 * - Non-damage HP ops clamp to [10, 9990]
 * - Attack power ops clamp to [0, 9990]
 */
export function applyNumericMode(
  current: number,
  mode: NumMode,
  operand: number,
  statKind: 'hp' | 'attackPower',
): number {
  let raw = current;
  switch (mode) {
    case 'add':
      raw = current + operand;
      break;
    case 'sub':
      raw = current - operand;
      break;
    case 'set':
      raw = operand;
      break;
    case 'multiply':
      raw = current * operand;
      break;
    case 'divide': {
      const divisor = operand === 0 ? 1 : operand;
      raw = Math.floor(current / divisor / 10) * 10;
      break;
    }
  }
  const minFloor = statKind === 'hp' ? MIN_HP_FROM_EFFECTS : MIN_ATTACK_POWER;
  return Math.max(minFloor, Math.min(MAX_STAT_VALUE, raw));
}

/**
 * Evaluates a `StatRef` dynamically against the current `EffectExecContext`.
 */
export function evalStatRef(ref: StatRef, ctx: EffectExecContext): number {
  const { state, userSide, slotPowers } = ctx;
  if (ref.stat === 'lastMovedCount') {
    return ctx.lastMovedCount;
  }

  const targetSide = resolveWho(userSide, ref.who);
  const player = state.players[targetSide];
  const digimon = player.battleDigimon;

  switch (ref.stat) {
    case 'hp':
      return digimon?.currentHp ?? 0;
    case 'maxHp':
      return digimon?.maxHp ?? 0;
    case 'attackPower': {
      const slotSel: AttackSlotSel = ref.slot ?? 'chosen';
      if (slotSel === 'circle' || slotSel === 'triangle' || slotSel === 'x') {
        return slotPowers[targetSide][slotSel];
      }
      const chosen = getEffectiveAttack(state, targetSide);
      return slotPowers[targetSide][chosen];
    }
    case 'dpCount':
      return player.dpSlot.length;
    case 'handCount':
      return player.hand.length;
    case 'onlineCount':
      return player.online.length;
    case 'offlineCount':
      return player.offline.length;
    case 'koCount':
      return player.koCount;
    case 'levelRank': {
      if (!digimon) return 0;
      const card = getCardById(digimon.cardId);
      return getLevelRank(card?.level);
    }
  }
}

/**
 * Evaluates a `ValueExpr` (`number` or `{ ref, mul?, add? }`).
 */
export function evalValueExpr(expr: ValueExpr, ctx: EffectExecContext): number {
  if (typeof expr === 'number') return expr;
  const base = evalStatRef(expr.ref, ctx);
  const mul = expr.mul ?? 1;
  const add = expr.add ?? 0;
  return base * mul + add;
}

/**
 * Evaluates a `CountExpr` given a maximum available count.
 */
export function evalCountExpr(expr: CountExpr, maxAvailable: number, ctx: EffectExecContext): number {
  if (expr === 'all') return maxAvailable;
  const val = Math.floor(evalValueExpr(expr, ctx));
  return Math.max(0, Math.min(maxAvailable, val));
}

export function compareNumbers(left: number, cmp: Cmp, right: number): boolean {
  switch (cmp) {
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'gte':
      return left >= right;
    case 'gt':
      return left > right;
  }
}

/**
 * Evaluates a `Condition` dynamically against the current `EffectExecContext`.
 */
export function evalCondition(cond: Condition, ctx: EffectExecContext): boolean {
  const { state, userSide } = ctx;
  switch (cond.cond) {
    case 'specialtyIs': {
      const side = resolveWho(userSide, cond.who);
      const spec = state.players[side].battleDigimon?.effectiveSpecialty;
      return spec !== undefined && cond.in.includes(spec);
    }
    case 'specialtiesSame': {
      const s1 = state.players.player.battleDigimon?.effectiveSpecialty;
      const s2 = state.players.opponent.battleDigimon?.effectiveSpecialty;
      return Boolean(s1 && s2 && s1 === s2);
    }
    case 'levelIs': {
      const side = resolveWho(userSide, cond.who);
      const digimon = state.players[side].battleDigimon;
      if (!digimon) return false;
      const card = getCardById(digimon.cardId);
      return matchesLevelList(card?.level, cond.in);
    }
    case 'levelCompare': {
      const selfRank = evalStatRef({ stat: 'levelRank', who: 'self' }, ctx);
      const oppRank = evalStatRef({ stat: 'levelRank', who: 'opponent' }, ctx);
      return compareNumbers(selfRank, cond.cmp, oppRank);
    }
    case 'attackIs': {
      const side = resolveWho(userSide, cond.who);
      const slot = getEffectiveAttack(state, side);
      return cond.in.includes(slot);
    }
    case 'attacksSame': {
      const a1 = getEffectiveAttack(state, 'player');
      const a2 = getEffectiveAttack(state, 'opponent');
      return a1 === a2;
    }
    case 'attacksDifferent': {
      const a1 = getEffectiveAttack(state, 'player');
      const a2 = getEffectiveAttack(state, 'opponent');
      return a1 !== a2;
    }
    case 'compare': {
      const left = evalValueExpr(cond.left, ctx);
      const right = evalValueExpr(cond.right, ctx);
      return compareNumbers(left, cond.cmp, right);
    }
    case 'not':
      return !evalCondition(cond.c, ctx);
    case 'and':
      return cond.cs.every((c) => evalCondition(c, ctx));
    case 'or':
      return cond.cs.some((c) => evalCondition(c, ctx));
  }
}

function matchesCardFilter(card: CardData, filter: CardFilter): boolean {
  if (filter.cardIds && filter.cardIds.length > 0 && !filter.cardIds.includes(card.id)) {
    return false;
  }
  if (filter.kind && filter.kind !== 'any') {
    if (filter.kind === 'digimon' && card.kind !== 'Digimon') return false;
    if (filter.kind === 'option' && card.kind !== 'Option') return false;
  }
  if (filter.specialties && filter.specialties.length > 0) {
    if (!card.specialty || !filter.specialties.includes(card.specialty)) return false;
  }
  if (filter.levels && filter.levels.length > 0) {
    if (!card.level) return false;
    // Note: If filter specifically says ['R P'] (e.g. Partner Finder), only 'R P' matches.
    // If filter says ['R'] and not ['R P'], matchesLevelList allows 'R P' as Rookie.
    if (filter.levels.length === 1 && filter.levels[0] === 'R P') {
      if (card.level !== 'R P') return false;
    } else if (!matchesLevelList(card.level, filter.levels)) {
      return false;
    }
  }
  return true;
}

function selectIndices(
  poolLength: number,
  count: number,
  selection: Selection,
  state: MatchState,
): number[] {
  if (count <= 0 || poolLength <= 0) return [];
  if (count >= poolLength) {
    return Array.from({ length: poolLength }, (_, i) => i);
  }
  const useRandom =
    selection === 'random' ||
    (selection === 'unspecified' && (state.config.unspecifiedSelection ?? 'random') === 'random');
  if (useRandom) {
    return pickRandomIndices(poolLength, count, state);
  }
  return Array.from({ length: count }, (_, i) => i);
}

const FORWARD_ROTATE: Record<AttackSlot, AttackSlot> = {
  circle: 'triangle',
  triangle: 'x',
  x: 'circle',
};

const BACKWARD_ROTATE: Record<AttackSlot, AttackSlot> = {
  circle: 'x',
  x: 'triangle',
  triangle: 'circle',
};

function ensureBattleStructures(state: MatchState): void {
  if (!state.battle) return;
  if (!state.battle.effectiveAttacks) {
    state.battle.effectiveAttacks = {
      player: state.battle.chosenAttacks.player ?? 'circle',
      opponent: state.battle.chosenAttacks.opponent ?? 'circle',
    };
  }
  if (!state.battle.grantedAbilities) {
    state.battle.grantedAbilities = { player: [], opponent: [] };
  }
  if (!state.battle.abilityRemoved) {
    state.battle.abilityRemoved = { player: false, opponent: false };
  }
  if (!state.battle.reviveOnKo) {
    state.battle.reviveOnKo = { player: null, opponent: null };
  }
}

function addGrantedAbilityToSide(state: MatchState, side: PlayerSide, ability: GrantedAbility): void {
  ensureBattleStructures(state);
  if (state.battle?.grantedAbilities) {
    state.battle.grantedAbilities[side].push(ability);
  }
  const digimon = state.players[side].battleDigimon;
  if (digimon) {
    digimon.tempModifiers = digimon.tempModifiers ?? {};
    digimon.tempModifiers.grantedAbilities = digimon.tempModifiers.grantedAbilities ?? [];
    digimon.tempModifiers.grantedAbilities.push(ability);
  }
}

/**
 * Checks whether an op list contains a `voidSupport` operation (including nested inside `if` or `seq`),
 * and evaluates only the `voidSupport` branches during Substep 3A.
 */
export function evaluateVoidSupportPreCheck(
  ops: readonly EffectOp[],
  ctx: EffectExecContext,
): void {
  for (const op of ops) {
    switch (op.op) {
      case 'voidSupport':
        executeSingleOp(op, ctx);
        break;
      case 'if':
        if (evalCondition(op.cond, ctx)) {
          evaluateVoidSupportPreCheck(op.then, ctx);
        } else if (op.else) {
          evaluateVoidSupportPreCheck(op.else, ctx);
        }
        break;
      case 'seq':
        evaluateVoidSupportPreCheck(op.ops, ctx);
        break;
      default:
        break;
    }
  }
}

/**
 * Executes a list of `EffectOp`s in sequence.
 */
export function executeEffectOps(
  ops: readonly EffectOp[],
  ctx: EffectExecContext,
  options?: { skipVoidSupport?: boolean },
): void {
  for (const op of ops) {
    if (options?.skipVoidSupport && op.op === 'voidSupport') {
      continue;
    }
    executeSingleOp(op, ctx, options);
  }
}

export function executeSingleOp(
  op: EffectOp,
  ctx: EffectExecContext,
  options?: { skipVoidSupport?: boolean },
): void {
  const { state, userSide, slotPowers } = ctx;
  ensureBattleStructures(state);

  switch (op.op) {
    case 'attackPower': {
      // Note: Evaluate value per target or before? In EFFECT_DSL.md:
      // For 'self' or 'opponent', there is 1 target; for 'both', evaluate operand and apply to self then opponent.
      const operand = evalValueExpr(op.value, ctx);
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        const slotSel: AttackSlotSel = op.slot ?? 'chosen';
        const slots: AttackSlot[] =
          slotSel === 'all'
            ? ['circle', 'triangle', 'x']
            : slotSel === 'chosen'
              ? [getEffectiveAttack(state, side)]
              : [slotSel];

        const chosenBefore = slotPowers[side][getEffectiveAttack(state, side)];
        for (const s of slots) {
          slotPowers[side][s] = applyNumericMode(slotPowers[side][s], op.mode, operand, 'attackPower');
        }
        syncComputedPowers(ctx);
        const chosenAfter = slotPowers[side][getEffectiveAttack(state, side)];
        state.events.push({
          type: 'statModified',
          side,
          stat: 'attackPower',
          delta: chosenAfter - chosenBefore,
          newValue: chosenAfter,
        });
      }
      break;
    }

    case 'swapAttackPower': {
      const selfSide = userSide;
      const oppSide = otherSide(userSide);
      const selfSlot = getEffectiveAttack(state, selfSide);
      const oppSlot = getEffectiveAttack(state, oppSide);
      const selfOld = slotPowers[selfSide][selfSlot];
      const oppOld = slotPowers[oppSide][oppSlot];
      slotPowers[selfSide][selfSlot] = oppOld;
      slotPowers[oppSide][oppSlot] = selfOld;
      syncComputedPowers(ctx);
      state.events.push({
        type: 'statModified',
        side: selfSide,
        stat: 'attackPower',
        delta: oppOld - selfOld,
        newValue: oppOld,
      });
      state.events.push({
        type: 'statModified',
        side: oppSide,
        stat: 'attackPower',
        delta: selfOld - oppOld,
        newValue: selfOld,
      });
      break;
    }

    case 'forceAttack': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        const prev = getEffectiveAttack(state, side);
        if (state.battle) {
          state.battle.effectiveAttacks = state.battle.effectiveAttacks ?? {
            player: state.battle.chosenAttacks.player ?? 'circle',
            opponent: state.battle.chosenAttacks.opponent ?? 'circle',
          };
          state.battle.effectiveAttacks[side] = op.to;
        }
        syncComputedPowers(ctx);
        if (prev !== op.to) {
          state.events.push({
            type: 'attackChanged',
            side,
            from: prev,
            to: op.to,
          });
        }
      }
      break;
    }

    case 'rotateAttack': {
      const targets = resolveTargets(userSide, op.target);
      const map = op.direction === 'backward' ? BACKWARD_ROTATE : FORWARD_ROTATE;
      for (const side of targets) {
        const prev = getEffectiveAttack(state, side);
        const next = map[prev];
        if (state.battle) {
          state.battle.effectiveAttacks = state.battle.effectiveAttacks ?? {
            player: state.battle.chosenAttacks.player ?? 'circle',
            opponent: state.battle.chosenAttacks.opponent ?? 'circle',
          };
          state.battle.effectiveAttacks[side] = next;
        }
        syncComputedPowers(ctx);
        state.events.push({
          type: 'attackChanged',
          side,
          from: prev,
          to: next,
        });
      }
      break;
    }

    case 'grantAbility': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        addGrantedAbilityToSide(state, side, op.ability);
      }
      break;
    }

    case 'removeAbility': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        if (state.battle) {
          state.battle.abilityRemoved = state.battle.abilityRemoved ?? {
            player: false,
            opponent: false,
          };
          state.battle.abilityRemoved[side] = true;
          if (state.battle.grantedAbilities) {
            state.battle.grantedAbilities[side] = [];
          }
        }
        const digimon = state.players[side].battleDigimon;
        if (digimon) {
          digimon.tempModifiers = digimon.tempModifiers ?? {};
          digimon.tempModifiers.abilityRemoved = true;
          digimon.tempModifiers.grantedAbilities = [];
        }
      }
      break;
    }

    case 'attackFirst': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        ctx.attackOrderOverride[side] = 'first';
      }
      break;
    }

    case 'attackSecond': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        ctx.attackOrderOverride[side] = 'second';
      }
      break;
    }

    case 'hp': {
      const operand = evalValueExpr(op.value, ctx);
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        const digimon = state.players[side].battleDigimon;
        if (!digimon) continue;
        const oldHp = digimon.currentHp;
        const newHp = applyNumericMode(oldHp, op.mode, operand, 'hp');
        digimon.currentHp = newHp;
        state.events.push({
          type: 'statModified',
          side,
          stat: 'hp',
          delta: newHp - oldHp,
          newValue: newHp,
        });
      }
      break;
    }

    case 'swapHp': {
      const selfSide = userSide;
      const oppSide = otherSide(userSide);
      const dSelf = state.players[selfSide].battleDigimon;
      const dOpp = state.players[oppSide].battleDigimon;
      if (dSelf && dOpp) {
        const selfOld = dSelf.currentHp;
        const oppOld = dOpp.currentHp;
        dSelf.currentHp = Math.max(MIN_HP_FROM_EFFECTS, Math.min(MAX_STAT_VALUE, oppOld));
        dOpp.currentHp = Math.max(MIN_HP_FROM_EFFECTS, Math.min(MAX_STAT_VALUE, selfOld));
        state.events.push({
          type: 'statModified',
          side: selfSide,
          stat: 'hp',
          delta: dSelf.currentHp - selfOld,
          newValue: dSelf.currentHp,
        });
        state.events.push({
          type: 'statModified',
          side: oppSide,
          stat: 'hp',
          delta: dOpp.currentHp - oppOld,
          newValue: dOpp.currentHp,
        });
      }
      break;
    }

    case 'reviveOnKo': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        if (state.battle) {
          state.battle.reviveOnKo = state.battle.reviveOnKo ?? { player: null, opponent: null };
          state.battle.reviveOnKo[side] = op.hp;
        }
        const digimon = state.players[side].battleDigimon;
        if (digimon) {
          digimon.tempModifiers = digimon.tempModifiers ?? {};
          digimon.tempModifiers.reviveOnKoHp = op.hp;
        }
      }
      break;
    }

    case 'setSpecialty': {
      const newSpecialty: Specialty =
        typeof op.to === 'string'
          ? op.to
          : (state.players[resolveWho(userSide, op.to.copyFrom)].battleDigimon?.effectiveSpecialty ??
            'Fire');
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        const digimon = state.players[side].battleDigimon;
        if (!digimon) continue;
        digimon.effectiveSpecialty = newSpecialty;
        state.events.push({
          type: 'statModified',
          side,
          stat: 'specialty',
          newValue: newSpecialty,
        });
      }
      break;
    }

    case 'swapSpecialty': {
      const selfSide = userSide;
      const oppSide = otherSide(userSide);
      const dSelf = state.players[selfSide].battleDigimon;
      const dOpp = state.players[oppSide].battleDigimon;
      if (dSelf && dOpp) {
        const tmp = dSelf.effectiveSpecialty;
        dSelf.effectiveSpecialty = dOpp.effectiveSpecialty;
        dOpp.effectiveSpecialty = tmp;
        state.events.push({
          type: 'statModified',
          side: selfSide,
          stat: 'specialty',
          newValue: dSelf.effectiveSpecialty,
        });
        state.events.push({
          type: 'statModified',
          side: oppSide,
          stat: 'specialty',
          newValue: dOpp.effectiveSpecialty,
        });
      }
      break;
    }

    case 'voidSupport': {
      if (!state.battle) break;
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        const sup = state.battle.supportCards[side];
        if (!sup || sup.voided) continue;
        const supCard = getCardById(sup.cardId);
        const canVoid =
          op.scope === 'supportAndOption' ||
          (op.scope === 'support' && supCard?.kind === 'Digimon');
        if (canVoid) {
          sup.voided = true;
          state.events.push({
            type: 'supportVoided',
            side,
            bySide: userSide,
            cardId: sup.cardId,
          });
        }
      }
      break;
    }

    case 'copyStats': {
      const srcSide = resolveWho(userSide, op.from);
      const dstSide = otherSide(srcSide);
      const dSrc = state.players[srcSide].battleDigimon;
      const dDst = state.players[dstSide].battleDigimon;

      for (const stat of op.stats) {
        if (stat === 'attackPower') {
          const srcPower = slotPowers[srcSide][getEffectiveAttack(state, srcSide)];
          const dstSlot = getEffectiveAttack(state, dstSide);
          const oldPower = slotPowers[dstSide][dstSlot];
          slotPowers[dstSide][dstSlot] = Math.max(
            MIN_ATTACK_POWER,
            Math.min(MAX_STAT_VALUE, srcPower),
          );
          syncComputedPowers(ctx);
          state.events.push({
            type: 'statModified',
            side: dstSide,
            stat: 'attackPower',
            delta: slotPowers[dstSide][dstSlot] - oldPower,
            newValue: slotPowers[dstSide][dstSlot],
          });
        } else if (stat === 'hp' && dSrc && dDst) {
          const oldHp = dDst.currentHp;
          dDst.currentHp = Math.max(MIN_HP_FROM_EFFECTS, Math.min(MAX_STAT_VALUE, dSrc.currentHp));
          state.events.push({
            type: 'statModified',
            side: dstSide,
            stat: 'hp',
            delta: dDst.currentHp - oldHp,
            newValue: dDst.currentHp,
          });
        } else if (stat === 'specialty' && dSrc && dDst) {
          dDst.effectiveSpecialty = dSrc.effectiveSpecialty;
          state.events.push({
            type: 'statModified',
            side: dstSide,
            stat: 'specialty',
            newValue: dDst.effectiveSpecialty,
          });
        }
      }
      break;
    }

    case 'draw': {
      const count = Math.max(0, Math.floor(evalValueExpr(op.count, ctx)));
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const actual = Math.min(count, player.online.length);
        const drawn = player.online.splice(0, actual);
        player.hand.push(...drawn);
        totalMoved += drawn.length;
        if (drawn.length > 0) {
          state.events.push({
            type: 'cardsDrawn',
            side,
            cardIds: drawn,
            count: drawn.length,
          });
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'online',
            to: 'hand',
            cardIds: drawn,
            count: drawn.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'drawUntil': {
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const needed = Math.max(0, op.handSize - player.hand.length);
        const actual = Math.min(needed, player.online.length);
        const drawn = player.online.splice(0, actual);
        player.hand.push(...drawn);
        totalMoved += drawn.length;
        if (drawn.length > 0) {
          state.events.push({
            type: 'cardsDrawn',
            side,
            cardIds: drawn,
            count: drawn.length,
          });
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'online',
            to: 'hand',
            cardIds: drawn,
            count: drawn.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'discardHand': {
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const count = evalCountExpr(op.count, player.hand.length, ctx);
        const indices = selectIndices(player.hand.length, count, op.selection, state);
        const discarded: CardId[] = [];
        // Extract in ascending order for event record, remove in descending order from hand
        for (const idx of indices) {
          discarded.push(player.hand[idx]!);
        }
        for (let i = indices.length - 1; i >= 0; i--) {
          player.hand.splice(indices[i]!, 1);
        }
        player.offline.push(...discarded);
        totalMoved += discarded.length;
        if (discarded.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'hand',
            to: 'offline',
            cardIds: discarded,
            count: discarded.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'mill': {
      const count = Math.max(0, Math.floor(evalValueExpr(op.count, ctx)));
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const actual = Math.min(count, player.online.length);
        const milled = player.online.splice(0, actual);
        player.offline.push(...milled);
        totalMoved += milled.length;
        if (milled.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'online',
            to: 'offline',
            cardIds: milled,
            count: milled.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'discardDp': {
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const count = evalCountExpr(op.count, player.dpSlot.length, ctx);
        const discarded: CardId[] = [];
        // Most recently placed DP card is at the end of dpSlot
        for (let i = 0; i < count; i++) {
          const popped = player.dpSlot.pop();
          if (popped !== undefined) {
            discarded.push(popped);
          }
        }
        player.dpTotal = computeDpTotal(player.dpSlot);
        player.offline.push(...discarded);
        totalMoved += discarded.length;
        if (discarded.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'dpSlot',
            to: 'offline',
            cardIds: discarded,
            count: discarded.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'handToDeck': {
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const moved = player.hand.splice(0, player.hand.length);
        player.online.push(...moved);
        if (op.shuffle) {
          shuffleInPlace(player.online, state);
        }
        totalMoved += moved.length;
        if (moved.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'hand',
            to: 'online',
            cardIds: moved,
            count: moved.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'recycleOffline': {
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const actual = Math.min(Math.max(0, op.count), player.offline.length);
        // Take top cards of offline pile (most recently discarded at end of offline array)
        const recycled: CardId[] = [];
        for (let i = 0; i < actual; i++) {
          const popped = player.offline.pop();
          if (popped !== undefined) {
            recycled.push(popped);
          }
        }
        if (op.position === 'bottom') {
          player.online.push(...recycled);
        } else {
          player.online.unshift(...recycled);
        }
        if (op.shuffle) {
          shuffleInPlace(player.online, state);
        }
        totalMoved += recycled.length;
        if (recycled.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'offline',
            to: 'online',
            cardIds: recycled,
            count: recycled.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'searchDeck': {
      const targets = resolveTargets(userSide, op.target);
      let totalMoved = 0;
      for (const side of targets) {
        const player = state.players[side];
        const matchingDeckIndices: number[] = [];
        for (let i = 0; i < player.online.length; i++) {
          const card = getCardById(player.online[i]!);
          if (card && matchesCardFilter(card, op.filter)) {
            matchingDeckIndices.push(i);
          }
        }
        const pickPositions = selectIndices(
          matchingDeckIndices.length,
          op.count,
          op.selection,
          state,
        );
        const chosenDeckIndices = pickPositions.map((pos) => matchingDeckIndices[pos]!);
        const foundCards: CardId[] = chosenDeckIndices.map((idx) => player.online[idx]!);

        // Remove from online in descending index order
        const sortedDesc = [...chosenDeckIndices].sort((a, b) => b - a);
        for (const idx of sortedDesc) {
          player.online.splice(idx, 1);
        }
        player.hand.push(...foundCards);
        if (op.shuffleAfter) {
          shuffleInPlace(player.online, state);
        }
        totalMoved += foundCards.length;
        if (foundCards.length > 0) {
          state.events.push({
            type: 'cardsMoved',
            side,
            from: 'online',
            to: 'hand',
            cardIds: foundCards,
            count: foundCards.length,
          });
        }
      }
      ctx.lastMovedCount = totalMoved;
      break;
    }

    case 'digivolveModifier': {
      const player = state.players[userSide];
      const prev = player.activeDigivolveModifier ?? {};
      player.activeDigivolveModifier = {
        ignoreSpecialty: Boolean(prev.ignoreSpecialty || op.ignoreSpecialty),
        ignoreLevel: Boolean(prev.ignoreLevel || op.ignoreLevel),
        ignoreDp: Boolean(prev.ignoreDp || op.ignoreDp),
        extraDp: (prev.extraDp ?? 0) + (op.extraDp ?? 0),
        allowSameLevel: Boolean(prev.allowSameLevel || op.allowSameLevel),
        allowSkipLevel: Boolean(prev.allowSkipLevel || op.allowSkipLevel),
        requireFromLevels: op.requireFromLevels ?? prev.requireFromLevels,
        allowedToLevels: op.allowedToLevels ?? prev.allowedToLevels,
        notInAbnormal: Boolean(prev.notInAbnormal || op.notInAbnormal),
        sourceCardId: ctx.sourceCardId ?? prev.sourceCardId,
      };
      break;
    }

    case 'devolve': {
      const targets = resolveTargets(userSide, op.target);
      for (const side of targets) {
        const player = state.players[side];
        const digimon = player.battleDigimon;
        if (!digimon || digimon.stack.length === 0) continue;

        const currentCard = getCardById(digimon.cardId);
        if (op.requireFromLevels && op.requireFromLevels.length > 0) {
          if (!matchesLevelList(currentCard?.level, op.requireFromLevels)) {
            continue;
          }
        }

        const levelsToDevolve = Math.min(op.levels ?? 1, digimon.stack.length);
        if (levelsToDevolve <= 0) continue;

        const targetStackIdx = digimon.stack.length - levelsToDevolve;
        const targetUnderlyingCardId = digimon.stack[targetStackIdx]!;
        const targetUnderlyingCard = getCardById(targetUnderlyingCardId);
        if (!targetUnderlyingCard) continue;

        if (op.toLevel) {
          if (!matchesLevelList(targetUnderlyingCard.level, [op.toLevel])) {
            continue;
          }
        }

        const fromCardId = digimon.cardId;
        const discardedTopCards: CardId[] = [];
        for (let step = 0; step < levelsToDevolve; step++) {
          discardedTopCards.push(digimon.cardId);
          digimon.cardId = digimon.stack.pop()!;
        }
        player.offline.push(...discardedTopCards);

        digimon.maxHp = targetUnderlyingCard.hp;
        digimon.currentHp = targetUnderlyingCard.hp;
        digimon.effectiveSpecialty = targetUnderlyingCard.specialty ?? 'Fire';

        state.events.push({
          type: 'cardsMoved',
          side,
          from: 'battle',
          to: 'offline',
          cardIds: discardedTopCards,
          count: discardedTopCards.length,
        });
        state.events.push({
          type: 'devolved',
          side,
          fromCardId,
          toCardId: digimon.cardId,
          hp: digimon.currentHp,
        });

        if (op.onSuccess && op.onSuccess.length > 0) {
          executeEffectOps(op.onSuccess, ctx, options);
        }
      }
      break;
    }

    case 'if': {
      if (evalCondition(op.cond, ctx)) {
        executeEffectOps(op.then, ctx, options);
      } else if (op.else) {
        executeEffectOps(op.else, ctx, options);
      }
      break;
    }

    case 'seq': {
      executeEffectOps(op.ops, ctx, options);
      break;
    }

    case 'random': {
      if (op.branches.length === 0) break;
      const weights = op.branches.map((b) => b.weight ?? 1);
      const picked = pickWeightedIndex(weights, state);
      const branch = op.branches[picked];
      if (branch) {
        executeEffectOps(branch.ops, ctx, options);
      }
      break;
    }

    case 'useTopCardSupport': {
      const depth = ctx.recursionDepth ?? 0;
      if (depth >= 5) break;
      const targetDeckSide = resolveWho(userSide, op.target);
      const player = state.players[targetDeckSide];
      if (player.online.length === 0) break;

      const topCardId = player.online.shift()!;
      player.offline.push(topCardId);
      ctx.lastMovedCount = 1;
      state.events.push({
        type: 'cardsMoved',
        side: targetDeckSide,
        from: 'online',
        to: 'offline',
        cardIds: [topCardId],
        count: 1,
      });

      const effectDef = resolveCardEffectDef(topCardId, ctx.effectRegistry);
      if (effectDef && (effectDef.timing === 'support' || effectDef.timing === 'both')) {
        ctx.recursionDepth = depth + 1;
        executeEffectOps(effectDef.ops, ctx);
        ctx.recursionDepth = depth;
      }
      break;
    }

    case 'none':
      break;

    case 'unimplemented':
      state.events.push({
        type: 'log',
        side: userSide,
        message: `Unimplemented effect: ${op.text}`,
      });
      break;
  }
}

// ---------------------------------------------------------------------------
// Effect Registry Lookup with Built-in Fallback
// ---------------------------------------------------------------------------

let globalEffectRegistry: EffectRegistry | null = null;

/**
 * Allows registering or overriding the global EffectRegistry at runtime.
 */
export function registerEffectRegistry(registry: EffectRegistry): void {
  globalEffectRegistry = registry;
}

/**
 * Fallback definitions for Digivolve-phase Option cards (293..300) and common test cards,
 * plus automatic text parser fallback if `src/data/effects/index.ts` is not yet injected.
 */
const BUILTIN_DIGIVOLVE_OPTION_EFFECTS: Record<number, CardEffectDef> = {
  293: {
    cardId: 293,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', ignoreSpecialty: true, ignoreLevel: true, ignoreDp: true }],
  },
  294: {
    cardId: 294,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', requireFromLevels: ['A'], allowedToLevels: ['C', 'U'] }],
  },
  295: {
    cardId: 295,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', ignoreSpecialty: true, extraDp: 20 }],
  },
  296: {
    cardId: 296,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', allowSameLevel: true, ignoreSpecialty: true }],
  },
  297: {
    cardId: 297,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', allowSkipLevel: true, requireFromLevels: ['R', 'R P'], allowedToLevels: ['U'] }],
  },
  298: {
    cardId: 298,
    timing: 'digivolvePhase',
    ops: [{ op: 'devolve', target: 'self', levels: 1, requireFromLevels: ['A'], toLevel: 'R' }],
  },
  299: {
    cardId: 299,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', ignoreDp: true, notInAbnormal: true }],
  },
  300: {
    cardId: 300,
    timing: 'digivolvePhase',
    ops: [
      {
        op: 'devolve',
        target: 'self',
        levels: 1,
        onSuccess: [{ op: 'hp', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
};

/**
 * Resolves a card's `CardEffectDef` from custom registry, global registry, or built-in definitions.
 */
export function resolveCardEffectDef(
  cardId: CardId,
  customRegistry?: EffectRegistry,
): CardEffectDef | undefined {
  if (customRegistry && customRegistry[cardId]) {
    return customRegistry[cardId];
  }
  if (globalEffectRegistry && globalEffectRegistry[cardId]) {
    return globalEffectRegistry[cardId];
  }
  if (EFFECT_REGISTRY[cardId]) {
    return EFFECT_REGISTRY[cardId];
  }
  if (BUILTIN_DIGIVOLVE_OPTION_EFFECTS[cardId]) {
    return BUILTIN_DIGIVOLVE_OPTION_EFFECTS[cardId];
  }
  return undefined;
}
