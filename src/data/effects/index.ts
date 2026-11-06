import type { CardEffectDef, EffectRegistry } from '../../types/effects';
import { FIRE_ICE_EFFECTS } from './fire-ice';
import { NATURE_DARK_RARE_EFFECTS } from './nature-dark-rare';
import { OPTION_EFFECTS } from './option';

export { FIRE_ICE_EFFECTS, NATURE_DARK_RARE_EFFECTS, OPTION_EFFECTS };

/**
 * Complete 301-card Effect Registry (`000`..`300`).
 */
export const EFFECT_REGISTRY: EffectRegistry = {
  ...FIRE_ICE_EFFECTS,
  ...NATURE_DARK_RARE_EFFECTS,
  ...OPTION_EFFECTS,
};

/**
 * Look up the effect definition for a card ID (`0`..`300`).
 */
export function getCardEffect(cardId: number): CardEffectDef {
  const def = EFFECT_REGISTRY[cardId];
  if (!def) {
    throw new Error(`Effect definition for card ID ${cardId} not found`);
  }
  return def;
}

/**
 * Returns true if the card is an Option card used during the Digivolve Phase (`293`..`300`).
 */
export function isDigivolvePhaseOption(cardId: number): boolean {
  if (cardId < 191 || cardId > 300) return false;
  const def = EFFECT_REGISTRY[cardId];
  return def !== undefined && (def.timing === 'digivolvePhase' || def.timing === 'both');
}

/**
 * Returns true if the card is an Option card used in the Battle Support Slot (`191`..`292`).
 */
export function isBattleSupportOption(cardId: number): boolean {
  if (cardId < 191 || cardId > 300) return false;
  const def = EFFECT_REGISTRY[cardId];
  return def !== undefined && (def.timing === 'support' || def.timing === 'both');
}
