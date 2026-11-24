/**
 * Easy AI (Casual / Beginner Opponent) for Digimon Digital Card Battle (PS1).
 *
 * Uses light heuristics with deterministic visible-state randomness:
 * - Strictly obeys fair information hiding (depends only on `VisibleMatchState`).
 * - Places any legal Rookie from hand.
 * - Occasionally adds a card to DP or digivolves if immediately available, but often
 *   misses multi-step setups or ends preparation early.
 * - Chooses attacks weighted by printed base power with random variance.
 * - Rarely plays optimal support cards.
 */

import { getCardById } from '../data/cards';
import { getEffectiveCardData } from '../data/digiParts';
import { isRookieCard, nextRng, pickWeightedIndex } from '../engine';
import type { Action, MatchState, PlayerSide } from '../types/game';
import { createSanitizedAiContext } from './normal';

/**
 * Easy AI decision function.
 */
export function chooseEasyAction(state: MatchState, side: PlayerSide): Action {
  const { sanitizedState, legalActions, seed } = createSanitizedAiContext(state, side);
  if (legalActions.length === 0) {
    throw new Error(`No legal actions available for '${side}' in phase '${sanitizedState.phase}'.`);
  }
  if (legalActions.length === 1) {
    return legalActions[0]!;
  }

  const rngCarrier = { rngSeed: seed };
  const roll = (): number => {
    const step = nextRng(rngCarrier.rngSeed);
    rngCarrier.rngSeed = step.nextSeed;
    return step.value;
  };

  const player = sanitizedState.players[side];

  switch (sanitizedState.phase) {
    case 'mulligan': {
      // Easy AI almost always keeps its initial hand if it has a Rookie (~80% keep)
      const wantKeep = roll() < 0.8;
      const chosen = legalActions.find((a) => a.type === 'mulligan' && a.keep === wantKeep);
      return chosen ?? legalActions[0]!;
    }

    case 'rookiePlacement': {
      // Pick any true Rookie ('R' / 'R P') in hand first; fall back to direct C/U only if none
      const allPlaceActions = legalActions.filter(
        (a): a is Extract<Action, { type: 'placeRookie' }> => a.type === 'placeRookie',
      );
      if (allPlaceActions.length === 0) return legalActions[0]!;
      const rookieActions = allPlaceActions.filter((a) => {
        const cid = player.hand[a.handIndex];
        return cid !== undefined && isRookieCard(cid);
      });
      const pool = rookieActions.length > 0 ? rookieActions : allPlaceActions;
      const idx = Math.floor(roll() * pool.length);
      return pool[idx]!;
    }

    case 'digivolve': {
      // If a normal Digivolve is immediately available, take it ~55% of the time
      const immediateDigivolve = legalActions.filter((a) => a.type === 'digivolve');
      if (immediateDigivolve.length > 0 && roll() < 0.55) {
        const idx = Math.floor(roll() * immediateDigivolve.length);
        return immediateDigivolve[idx]!;
      }

      // Occasionally add a random Digimon card to DP Slot (~45% chance)
      const dpActions = legalActions.filter((a) => a.type === 'addToDp');
      if (dpActions.length > 0 && roll() < 0.45) {
        const idx = Math.floor(roll() * dpActions.length);
        return dpActions[idx]!;
      }

      // Rarely use a Digivolve Option (~15% chance)
      const optActions = legalActions.filter((a) => a.type === 'useDigivolveOption');
      if (optActions.length > 0 && roll() < 0.15) {
        const idx = Math.floor(roll() * optActions.length);
        return optActions[idx]!;
      }

      const endAction = legalActions.find((a) => a.type === 'endDigivolvePhase');
      return endAction ?? legalActions[0]!;
    }

    case 'attackSelect': {
      // Weight attacks mostly by base power + random variance, ignoring XEffect subtleties
      const active = player.battleDigimon;
      const card = active
        ? (getEffectiveCardData(active.cardId, sanitizedState.config.partnerConfig?.[side]) ??
          getCardById(active.cardId))
        : undefined;
      const atkActions = legalActions.filter(
        (a): a is Extract<Action, { type: 'chooseAttack' }> => a.type === 'chooseAttack',
      );
      if (atkActions.length === 0 || !card?.attacks) {
        return legalActions[0]!;
      }

      const weights = atkActions.map((act) => {
        const basePower = card.attacks![act.slot].power;
        const jitter = Math.floor(roll() * 220);
        return Math.max(90, basePower + jitter);
      });

      const pickedIdx = pickWeightedIndex(weights, rngCarrier);
      return atkActions[pickedIdx] ?? atkActions[0]!;
    }

    case 'supportSelect': {
      const r = roll();
      const passAct = legalActions.find((a) => a.type === 'passSupport');

      // 65% of the time Easy AI simply passes support
      if (r < 0.65 && passAct) {
        return passAct;
      }

      // 20% of the time Easy AI plays blind support from top of deck (if deck has plenty of cards)
      const deckTopAct = legalActions.find((a) => a.type === 'playSupportFromDeckTop');
      if (r < 0.85 && deckTopAct && player.online.length > 6) {
        return deckTopAct;
      }

      // Otherwise picks a random playable support card from hand
      const handActs = legalActions.filter((a) => a.type === 'playSupportFromHand');
      if (handActs.length > 0) {
        const idx = Math.floor(roll() * handActs.length);
        return handActs[idx]!;
      }

      return passAct ?? legalActions[0]!;
    }

    default:
      return legalActions[0]!;
  }
}
