/**
 * Hard AI (Expectimax / Monte Carlo Lookahead & Game-Theoretic Player)
 * for Digimon Digital Card Battle (PS1).
 *
 * Key capabilities:
 * - Strict information hiding via `createSanitizedAiContext` (determinization of unseen cards).
 * - Multi-step `digivolve` phase planning (`addToDp` -> `useDigivolveOption` -> `digivolve`)
 *   via depth-limited lookahead search using `applyAction`.
 * - 3x3 game-theoretic payoff matrix (`mySlot` x `oppSlot`) in `attackSelect` accounting for
 *   printed attacks, `XEffect`s (`Counter`, `to 0`, `Foe x3`, `1st Attack`, `Eat-Up HP`,
 *   `Crash`, `Jamming`), and best hand support synergy, blending Expected Value + Maximin.
 * - Expectimax / Monte Carlo evaluation in `supportSelect` across opponent's attack
 *   distribution and unseen deck-top samples without wasting high-value cards when a battle
 *   is already won or lost.
 */

import { getCardById } from '../data/cards';
import { getCardEffect, isBattleSupportOption } from '../data/effects';
import {
  ARMOR_LINEAGE,
  applyAction,
  getLegalActions,
  getLevelRank,
  otherSide,
} from '../engine';
import type { Action, AttackSlot, CardData, CardId, MatchState, PlayerSide } from '../types/game';
import {
  ATTACK_SLOTS,
  computeSupportCardOpportunityCost,
  createSanitizedAiContext,
  estimateOpponentAttackDistribution,
  scoreRookieForPlacement,
  simulateSingleBattleUtility,
  type SimulatedSupportChoice,
} from './normal';

// ---------------------------------------------------------------------------
// 1. 3x3 Payoff Matrix & Game-Theoretic Attack Evaluator
// ---------------------------------------------------------------------------

export type PayoffMatrix = Record<AttackSlot, Record<AttackSlot, number>>;

/**
 * Computes the 3x3 battle payoff matrix `M[mySlot][oppSlot]` from `side`'s perspective,
 * optionally factoring in the best available Support card in `side`'s hand.
 */
export function computeBattlePayoffMatrix(
  sanitizedState: MatchState,
  side: PlayerSide,
  includeHandSupportSynergy: boolean,
): PayoffMatrix {
  const player = sanitizedState.players[side];
  const matrix: PayoffMatrix = {
    circle: { circle: 0, triangle: 0, x: 0 },
    triangle: { circle: 0, triangle: 0, x: 0 },
    x: { circle: 0, triangle: 0, x: 0 },
  };

  // Pre-filter playable hand supports with non-empty effects for fast synergy check
  const candidateHandSupports: Array<{ handIndex: number; cardId: CardId; cost: number }> = [];
  if (includeHandSupportSynergy) {
    const seenIds = new Set<CardId>();
    for (let i = 0; i < player.hand.length; i++) {
      const cid = player.hand[i]!;
      if (seenIds.has(cid)) continue;
      const card = getCardById(cid);
      if (!card) continue;
      if (card.kind !== 'Digimon' && !isBattleSupportOption(cid)) continue;
      const eff = getCardEffect(cid);
      if (eff.ops.length === 0 || (eff.ops.length === 1 && eff.ops[0]?.op === 'none')) {
        continue;
      }
      seenIds.add(cid);
      candidateHandSupports.push({
        handIndex: i,
        cardId: cid,
        cost: computeSupportCardOpportunityCost(sanitizedState, side, i),
      });
    }
  }

  for (const mySlot of ATTACK_SLOTS) {
    for (const oppSlot of ATTACK_SLOTS) {
      let bestCellUtility = simulateSingleBattleUtility(sanitizedState, side, mySlot, oppSlot, {
        kind: 'pass',
      });

      if (candidateHandSupports.length > 0) {
        for (const sup of candidateHandSupports) {
          const withSup =
            simulateSingleBattleUtility(sanitizedState, side, mySlot, oppSlot, {
              kind: 'hand',
              handIndex: sup.handIndex,
              cardId: sup.cardId,
            }) - sup.cost;
          if (withSup > bestCellUtility) {
            bestCellUtility = withSup;
          }
        }
      }

      matrix[mySlot][oppSlot] = bestCellUtility;
    }
  }

  return matrix;
}

/**
 * Computes opponent's game-theoretic mixed strategy over `['circle', 'triangle', 'x']`
 * by combining heuristic priors with quantal best-response (softmax) to the 3x3 payoff matrix.
 */
export function computeOpponentGameTheoreticStrategy(
  sanitizedState: MatchState,
  side: PlayerSide,
  matrix: PayoffMatrix,
): Record<AttackSlot, number> {
  const prior = estimateOpponentAttackDistribution(sanitizedState, side);

  // For each opponent slot, estimate opponent's expected payoff (which is -matrix[mySlot][oppSlot])
  // assuming we play a strong response.
  const oppWorstCasePayoff: Record<AttackSlot, number> = {
    circle: 0,
    triangle: 0,
    x: 0,
  };
  const oppAvgPayoff: Record<AttackSlot, number> = {
    circle: 0,
    triangle: 0,
    x: 0,
  };

  for (const oppSlot of ATTACK_SLOTS) {
    let worstForOpp = Infinity;
    let sumForOpp = 0;
    for (const mySlot of ATTACK_SLOTS) {
      const oppVal = -matrix[mySlot][oppSlot];
      if (oppVal < worstForOpp) worstForOpp = oppVal;
      sumForOpp += oppVal;
    }
    oppWorstCasePayoff[oppSlot] = worstForOpp;
    oppAvgPayoff[oppSlot] = sumForOpp / 3;
  }

  const oppComposite: Record<AttackSlot, number> = {
    circle: 0.55 * oppAvgPayoff.circle + 0.45 * oppWorstCasePayoff.circle,
    triangle: 0.55 * oppAvgPayoff.triangle + 0.45 * oppWorstCasePayoff.triangle,
    x: 0.55 * oppAvgPayoff.x + 0.45 * oppWorstCasePayoff.x,
  };

  const maxComp = Math.max(oppComposite.circle, oppComposite.triangle, oppComposite.x);
  const temperature = 900;
  const expWeights: Record<AttackSlot, number> = {
    circle: prior.circle * Math.exp((oppComposite.circle - maxComp) / temperature),
    triangle: prior.triangle * Math.exp((oppComposite.triangle - maxComp) / temperature),
    x: prior.x * Math.exp((oppComposite.x - maxComp) / temperature),
  };

  const sum = expWeights.circle + expWeights.triangle + expWeights.x;
  if (sum <= 0) return prior;

  return {
    circle: expWeights.circle / sum,
    triangle: expWeights.triangle / sum,
    x: expWeights.x / sum,
  };
}

/**
 * Evaluates a candidate `mySlot` against `matrix` and `oppStrategy`, blending
 * Expected Value (80%) and Maximin worst-case safety (20%).
 */
export function scoreAttackSlotFromMatrix(
  mySlot: AttackSlot,
  matrix: PayoffMatrix,
  oppStrategy: Record<AttackSlot, number>,
): number {
  let expected = 0;
  let worstCase = Infinity;
  for (const oppSlot of ATTACK_SLOTS) {
    const val = matrix[mySlot][oppSlot];
    expected += oppStrategy[oppSlot] * val;
    if (val < worstCase) {
      worstCase = val;
    }
  }
  return 0.82 * expected + 0.18 * worstCase;
}

// ---------------------------------------------------------------------------
// 2. Board & Preparation Phase Multi-Step Lookahead Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates the resulting board & hand state at the end of `side`'s `digivolve` phase
 * (just before `endDigivolvePhase` is called).
 */
export function evaluatePrepBoardState(state: MatchState, side: PlayerSide): number {
  const oppSide = otherSide(side);
  const player = state.players[side];
  const oppPlayer = state.players[oppSide];
  const active = player.battleDigimon;
  const oppActive = oppPlayer.battleDigimon;

  if (!active) return -10000;
  const activeCard = getCardById(active.cardId);
  if (!activeCard) return -10000;

  let score = 0;

  // 1. Active Digimon Level Rank & Base Stats
  const myLevelRank = getLevelRank(activeCard.level);
  if (activeCard.level === 'U') {
    score += 1350;
  } else if (activeCard.level === 'C') {
    score += 650;
  } else if (activeCard.level === 'A') {
    score += 540;
  }

  score += active.currentHp * 1.25;
  if (activeCard.attacks) {
    score +=
      activeCard.attacks.circle.power * 0.95 +
      activeCard.attacks.triangle.power * 0.7 +
      activeCard.attacks.x.power * 0.4;
  }

  // 2. Direct 3x3 Combat Readiness against Opponent's Active Digimon
  if (oppActive) {
    const matrix = computeBattlePayoffMatrix(state, side, false);
    const oppStrategy = computeOpponentGameTheoreticStrategy(state, side, matrix);
    const bestSlotScore = Math.max(
      scoreAttackSlotFromMatrix('circle', matrix, oppStrategy),
      scoreAttackSlotFromMatrix('triangle', matrix, oppStrategy),
      scoreAttackSlotFromMatrix('x', matrix, oppStrategy),
    );
    score += bestSlotScore * 0.55;
  }

  // 3. DP Slot Progression toward Evolution Targets Remaining in Hand
  let bestEvoProgressScore = 0;
  for (const cid of player.hand) {
    const c = getCardById(cid);
    if (!c || c.kind !== 'Digimon') continue;

    const isDirectNextEvo =
      c.specialty === active.effectiveSpecialty &&
      (((activeCard.level === 'R' || activeCard.level === 'R P') && c.level === 'C') ||
        (activeCard.level === 'C' && c.level === 'U'));

    if (isDirectNextEvo) {
      const reqDp = Math.max(10, c.dp);
      const ratio = Math.min(1, player.dpTotal / reqDp);
      const evoBonus = (c.level === 'U' ? 480 : 340) * ratio + (player.dpTotal >= c.dp ? 140 : 0);
      if (evoBonus > bestEvoProgressScore) {
        bestEvoProgressScore = evoBonus;
      }
    }
  }
  score += bestEvoProgressScore;

  // General DP banking value when not yet at Ultimate
  if (activeCard.level !== 'U') {
    score += Math.min(50, player.dpTotal) * 5.5;
  } else {
    score += Math.min(30, player.dpTotal) * 1.5;
  }

  // 4. Remaining Hand Quality & Tactical Reserves
  let hasRookieInHand = false;
  const seenEvoKeys = new Set<string>();

  for (const cid of player.hand) {
    const c = getCardById(cid);
    if (!c) continue;

    // Base card-in-hand conservation value
    score += 75;

    if (c.kind === 'Digimon') {
      score += c.plusP * 1.5;

      if (c.level === 'R' || c.level === 'R P') {
        if (!hasRookieInHand) {
          hasRookieInHand = true;
          // Keeping at least 1 backup Rookie is crucial if our active Digimon is vulnerable
          score += active.currentHp <= 600 ? 240 : 95;
        }
        if (c.level === 'R P') {
          score += 90;
        }
      }

      // Holding a valid next-level evolution in hand for next turn
      const isNextEvo =
        c.specialty === active.effectiveSpecialty &&
        (((activeCard.level === 'R' || activeCard.level === 'R P') && c.level === 'C') ||
          (activeCard.level === 'C' && c.level === 'U'));
      const isArmorEvo =
        activeCard.level === 'R P' &&
        c.level === 'A' &&
        Boolean(ARMOR_LINEAGE[activeCard.id]?.includes(c.id));

      const evoKey = `${c.level}-${c.specialty}`;
      if ((isNextEvo || isArmorEvo) && !seenEvoKeys.has(evoKey)) {
        seenEvoKeys.add(evoKey);
        score += isArmorEvo ? 310 : 260;
      }
    } else if (isBattleSupportOption(cid)) {
      score += 110;
    }
  }

  // Note: `activeDigivolveModifier` is intentionally NOT rewarded here because
  // `endDigivolvePhase` clears `activeDigivolveModifier = null`. Thus, playing a
  // Digivolve Option card is only rewarded if followed by an actual `digivolve`!
  void myLevelRank;

  return score;
}

interface PrepSearchResult {
  bestScore: number;
  firstAction: Action | null;
}

/**
 * Depth-limited search over `digivolve` phase actions (`armorDigivolve`, `digivolve`,
 * `useDigivolveOption`, `addToDp`) using `applyAction` from `src/engine`.
 */
function searchBestPrepSequence(
  state: MatchState,
  side: PlayerSide,
  depth: number,
): PrepSearchResult {
  // Score of ending the Digivolve phase right now
  const stopNowScore = evaluatePrepBoardState(state, side);
  if (depth <= 0 || state.phase !== 'digivolve' || state.activePlayer !== side) {
    return { bestScore: stopNowScore, firstAction: null };
  }

  const legalActions = getLegalActions(state, side);
  // Order immediate digivolutions first so ties always prefer evolving before spending extra cards
  const orderedActions = [...legalActions].sort((a, b) => {
    const rank = (t: Action['type']): number => {
      if (t === 'armorDigivolve') return 0;
      if (t === 'digivolve') return 1;
      if (t === 'useDigivolveOption') return 2;
      if (t === 'addToDp') return 3;
      return 4;
    };
    return rank(a.type) - rank(b.type);
  });
  let bestScore = stopNowScore;
  let bestFirstAction: Action | null = null;

  const player = state.players[side];
  const seenAddToDpCardIds = new Set<CardId>();
  const seenOptionCardIds = new Set<CardId>();
  const seenDigivolveCardIds = new Set<CardId>();

  for (const action of orderedActions) {
    if (action.type === 'endDigivolvePhase') continue;

    // Deduplicate identical card IDs in hand to keep branching factor small and fast
    if (action.type === 'addToDp') {
      const cid = player.hand[action.handIndex];
      if (cid !== undefined) {
        if (seenAddToDpCardIds.has(cid)) continue;
        seenAddToDpCardIds.add(cid);
      }
    } else if (action.type === 'useDigivolveOption') {
      const cid = player.hand[action.handIndex];
      if (cid !== undefined) {
        if (seenOptionCardIds.has(cid)) continue;
        seenOptionCardIds.add(cid);
      }
    } else if (action.type === 'digivolve' || action.type === 'armorDigivolve') {
      const cid = player.hand[action.handIndex];
      if (cid !== undefined) {
        if (seenDigivolveCardIds.has(cid)) continue;
        seenDigivolveCardIds.add(cid);
      }
    }

    const nextState = applyAction(state, action);
    const sub = searchBestPrepSequence(nextState, side, depth - 1);

    if (sub.bestScore > bestScore + 1e-6) {
      bestScore = sub.bestScore;
      bestFirstAction = action;
    }
  }

  return {
    bestScore,
    firstAction: bestFirstAction,
  };
}

// ---------------------------------------------------------------------------
// 3. Hard AI Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Hard AI: Expectimax / Monte Carlo lookahead & game-theoretic player.
 */
export function chooseHardAction(state: MatchState, side: PlayerSide): Action {
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
      // Evaluate best Rookie placement + evolution synergy in opening hand
      const rookies = player.hand
        .map((id, idx) => ({ card: getCardById(id), idx }))
        .filter((item): item is { card: CardData; idx: number } =>
          Boolean(item.card && (item.card.level === 'R' || item.card.level === 'R P')),
        );

      if (rookies.length === 0) {
        return legalActions.find((a) => a.type === 'mulligan' && !a.keep) ?? legalActions[0]!;
      }

      let bestOpeningScore = -Infinity;
      for (const r of rookies) {
        const s = scoreRookieForPlacement(sanitizedState, side, r.idx);
        if (s > bestOpeningScore) bestOpeningScore = s;
      }

      // Keep hand if we have a strong Rookie, Partner Rookie, evolution combo, or >= 2 Rookies
      const shouldKeep = bestOpeningScore >= 920 || rookies.length >= 2;
      return (
        legalActions.find((a) => a.type === 'mulligan' && a.keep === shouldKeep) ?? legalActions[0]!
      );
    }

    case 'rookiePlacement': {
      // Simulate placing each candidate Rookie and look ahead if we enter digivolve phase immediately
      let bestAction = legalActions[0]!;
      let bestScore = -Infinity;

      for (const action of legalActions) {
        if (action.type !== 'placeRookie') continue;
        const heuristicScore = scoreRookieForPlacement(sanitizedState, side, action.handIndex);
        const afterPlace = applyAction(sanitizedState, action);

        let lookaheadBonus = 0;
        if (afterPlace.phase === 'digivolve' && afterPlace.activePlayer === side) {
          const prepRes = searchBestPrepSequence(afterPlace, side, 3);
          lookaheadBonus = prepRes.bestScore * 0.35;
        }

        const totalScore = heuristicScore + lookaheadBonus;
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestAction = action;
        }
      }
      return bestAction;
    }

    case 'digivolve': {
      // Plan multi-step preparation sequences (up to 4 actions) using `applyAction`
      const searchResult = searchBestPrepSequence(sanitizedState, side, 4);
      if (searchResult.firstAction) {
        return searchResult.firstAction;
      }
      const endAct = legalActions.find((a) => a.type === 'endDigivolvePhase');
      return endAct ?? legalActions[0]!;
    }

    case 'attackSelect': {
      // Compute 3x3 payoff matrix considering both Digimon's attacks, XEffects, and hand support synergy
      const matrix = computeBattlePayoffMatrix(sanitizedState, side, true);
      const oppStrategy = computeOpponentGameTheoreticStrategy(sanitizedState, side, matrix);

      let bestAction = legalActions[0]!;
      let bestScore = -Infinity;

      for (const action of legalActions) {
        if (action.type !== 'chooseAttack') continue;
        const slotScore = scoreAttackSlotFromMatrix(action.slot, matrix, oppStrategy);
        if (slotScore > bestScore) {
          bestScore = slotScore;
          bestAction = action;
        }
      }
      return bestAction;
    }

    case 'supportSelect': {
      const mySlot: AttackSlot =
        (sanitizedState.battle?.chosenAttacks[side] as AttackSlot | null) ?? 'circle';
      const matrix = computeBattlePayoffMatrix(sanitizedState, side, false);
      const oppStrategy = computeOpponentGameTheoreticStrategy(sanitizedState, side, matrix);

      const evaluateExpectedSupportUtility = (choice: SimulatedSupportChoice): number => {
        let expected = 0;
        let worstCase = Infinity;
        for (const oppSlot of ATTACK_SLOTS) {
          const u = simulateSingleBattleUtility(sanitizedState, side, mySlot, oppSlot, choice);
          expected += oppStrategy[oppSlot] * u;
          if (u < worstCase) worstCase = u;
        }
        return 0.85 * expected + 0.15 * worstCase;
      };

      const passUtility = evaluateExpectedSupportUtility({ kind: 'pass' });
      let bestAction: Action =
        legalActions.find((a) => a.type === 'passSupport') ?? legalActions[0]!;
      let bestNetUtility = passUtility;

      // 1. Evaluate each `playSupportFromHand` action
      const seenCardIds = new Set<CardId>();
      for (const action of legalActions) {
        if (action.type !== 'playSupportFromHand') continue;
        const cardId = player.hand[action.handIndex];
        if (cardId === undefined || seenCardIds.has(cardId)) continue;
        seenCardIds.add(cardId);

        const eff = getCardEffect(cardId);
        if (eff.ops.length === 0 || (eff.ops.length === 1 && eff.ops[0]?.op === 'none')) {
          continue;
        }

        const rawUtility = evaluateExpectedSupportUtility({
          kind: 'hand',
          handIndex: action.handIndex,
          cardId,
        });
        const opportunityCost = computeSupportCardOpportunityCost(
          sanitizedState,
          side,
          action.handIndex,
        );
        const netUtility = rawUtility - opportunityCost;

        if (netUtility > bestNetUtility) {
          bestNetUtility = netUtility;
          bestAction = action;
        }
      }

      // 2. Evaluate `playSupportFromDeckTop` via Monte Carlo determinization over unseen deck pool
      const deckTopAction = legalActions.find((a) => a.type === 'playSupportFromDeckTop');
      if (deckTopAction && bestAction.type === 'passSupport' && player.online.length >= 9) {
        // Only gamble on blind deck-top support if we are not already winning comfortably
        if (passUtility < 250 && passUtility > -3200) {
          const sampleCount = Math.min(5, player.online.length);
          let sumUtility = 0;
          for (let i = 0; i < sampleCount; i++) {
            const sampleCardId = player.online[i]!;
            sumUtility += evaluateExpectedSupportUtility({
              kind: 'deckTop',
              cardId: sampleCardId,
            });
          }
          const deckMillRiskCost = player.online.length <= 12 ? 120 : 60;
          const expectedDeckTopUtility = sumUtility / sampleCount - deckMillRiskCost;
          if (expectedDeckTopUtility > bestNetUtility) {
            bestNetUtility = expectedDeckTopUtility;
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
