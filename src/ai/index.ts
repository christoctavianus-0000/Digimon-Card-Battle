/**
 * AI Engine Entry Point for Digimon Digital Card Battle (PS1).
 *
 * Exposes `chooseAiAction(state, side, difficulty)` and `AiDifficulty`
 * across all three difficulty levels (`easy`, `normal`, `hard`).
 */

import type { Action, MatchState, PlayerSide } from '../types/game';
import { chooseEasyAction } from './easy';
import { chooseHardAction } from './hard';
import { chooseNormalAction } from './normal';

export type AiDifficulty = 'easy' | 'normal' | 'hard';

export { chooseEasyAction } from './easy';
export {
  chooseNormalAction,
  computeSupportCardOpportunityCost,
  computeVisibleStateSeed,
  createSanitizedAiContext,
  estimateOpponentAttackDistribution,
  scoreRookieForPlacement,
  simulateSingleBattleUtility,
} from './normal';
export {
  chooseHardAction,
  computeBattlePayoffMatrix,
  computeOpponentGameTheoreticStrategy,
  evaluatePrepBoardState,
  scoreAttackSlotFromMatrix,
} from './hard';

/**
 * Selects a legal `Action` for `side` in `state` according to the specified `difficulty`.
 * Strictly enforces fair information hiding (`VisibleMatchState` only).
 */
export function chooseAiAction(
  state: MatchState,
  side: PlayerSide,
  difficulty: AiDifficulty = 'normal',
): Action {
  switch (difficulty) {
    case 'easy':
      return chooseEasyAction(state, side);
    case 'normal':
      return chooseNormalAction(state, side);
    case 'hard':
      return chooseHardAction(state, side);
  }
}
