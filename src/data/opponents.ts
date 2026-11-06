import type { CardId } from '../types/game';
import {
  GENERATED_DECKS,
  type DeckCardEntry,
  type DifficultyTier,
  type GeneratedBaseDeck,
} from './decks.generated';

export type { DeckCardEntry, DifficultyTier };

export type AiDifficultyLevel = 'easy' | 'normal' | 'hard';

/**
 * Full base deck definition parsed from `docs/base-deck-list..txt`.
 */
export interface BaseDeckDef {
  /** Unique deck identifier (e.g. "deck-001-tutorial-deck-a-k-a-betamon-deck"). */
  id: string;
  /** Corresponding opponent identifier. */
  opponentId: string;
  /** Zero-based index in the GameFAQs deck list (0..137). */
  index: number;
  /** Canonical deck name from GameFAQs (e.g. "Tutorial Deck A.K.A Betamon Deck"). */
  name: string;
  /** Specialty color breakdown (e.g. "4 Red, 9 Blue, 2 Green, 4 Black, 2 Yellow" or "Red"). */
  colors: string;
  /** Raw owner / duelist string from the deck header. */
  owner: string;
  /** Clean duelist display name (e.g. "Betamon (first deck)", "Agumon", "Analogman"). */
  duelistName: string;
  /** Optional arena / city location disambiguator (e.g. "Desert Island", "Dark City"). */
  location?: string;
  /** Optional header note (e.g. starter/gift note or Analogman fixed-order note). */
  note?: string;
  /** True if the deck cards are listed in a fixed play order (Analogman's Darkness Wave Deck). */
  preserveExactOrder?: boolean;
  /** Partner Armor evolution card ID if specified via an `Armor:` line in the deck list. */
  armorCardId?: CardId;
  /** Raw Armor evolution stats description line if present. */
  armorInfo?: string;
  /** Partner card IDs in this deck that have `[no armor]` / `--- no armor` specified. */
  disableArmorOnCardIds?: CardId[];
  /** Assigned difficulty tier based on deck composition and progression order. */
  tier: DifficultyTier;
  /** Representative Digimon card ID (0..300) used for avatar portrait rendering. */
  representativeCardId: CardId;
  /** Short flavor description of the deck and duelist. */
  description: string;
  /** Aggregated card counts (sum of counts === 30). */
  entries: DeckCardEntry[];
  /** Flat 30-card array of CardIds. */
  cards: CardId[];
}

/**
 * Structured opponent definition for Single-Player Opponent Select & AI battles.
 */
export interface OpponentDef {
  /** Unique opponent ID (e.g. "opp-001-betamon-first-deck"). */
  id: string;
  /** Duelist name (e.g. "Betamon (first deck)", "Agumon", "Meramon"). */
  name: string;
  /** Name of the opponent's deck. */
  deckName: string;
  /** ID of the opponent's deck in `ALL_BASE_DECKS`. */
  deckId: string;
  /** Flat 30-card array of CardIds. */
  cards: CardId[];
  /** Aggregated card entries `{ cardId, count }`. */
  entries: DeckCardEntry[];
  /** Assigned difficulty tier ('Easy' | 'Normal' | 'Hard' | 'Expert'). */
  tier: DifficultyTier;
  /** Default AI difficulty level mapped from `tier`. */
  defaultAiDifficulty: AiDifficultyLevel;
  /** Specialty color breakdown string. */
  colors: string;
  /** Representative Digimon card ID (0..300) for avatar portrait. */
  representativeCardId: CardId;
  /** Short flavor quote / description for the opponent select screen. */
  description: string;
  /** Alias for `description` for UI components expecting `quote`. */
  quote: string;
  /** Optional location disambiguator (e.g. "Desert Island", "Dark City"). */
  location?: string;
  /** Partner Armor card ID if the opponent uses an Armor evolution in this deck. */
  armorCardId?: CardId;
  /** Partner card IDs that explicitly have `[no armor]` / `--- no armor` in this deck. */
  disableArmorOnCardIds?: CardId[];
  /** True if the opponent's deck order is fixed (Analogman). */
  preserveExactOrder?: boolean;
}

function tierToAiDifficulty(tier: DifficultyTier): AiDifficultyLevel {
  switch (tier) {
    case 'Easy':
      return 'easy';
    case 'Normal':
      return 'normal';
    case 'Hard':
    case 'Expert':
      return 'hard';
  }
}

function toOpponentDef(deck: GeneratedBaseDeck): OpponentDef {
  return {
    id: deck.opponentId,
    name: deck.duelistName,
    deckName: deck.name,
    deckId: deck.id,
    cards: deck.cards,
    entries: deck.entries,
    tier: deck.tier,
    defaultAiDifficulty: tierToAiDifficulty(deck.tier),
    colors: deck.colors,
    representativeCardId: deck.representativeCardId,
    description: deck.description,
    quote: deck.description,
    ...(deck.location ? { location: deck.location } : {}),
    ...(typeof deck.armorCardId === 'number' ? { armorCardId: deck.armorCardId } : {}),
    ...(deck.disableArmorOnCardIds ? { disableArmorOnCardIds: deck.disableArmorOnCardIds } : {}),
    ...(deck.preserveExactOrder ? { preserveExactOrder: true } : {}),
  };
}

/**
 * All 138 base decks parsed from `docs/base-deck-list..txt`.
 */
export const ALL_BASE_DECKS: readonly BaseDeckDef[] = GENERATED_DECKS;

/**
 * All opponents available for battle, derived from `ALL_BASE_DECKS`.
 */
export const OPPONENTS: readonly OpponentDef[] = ALL_BASE_DECKS.map(toOpponentDef);

const STARTER_DECK_NAMES = new Set([
  'Tutorial Deck A.K.A Betamon Deck',
  'Tricolor Starter Deck',
  'Practice Deck',
  'Red Deck',
  'Green Deck',
  'Yellow Deck',
  'Penguinmon Color Deck',
  'New Power Deck',
  'Burning Hot! Deck',
  'Quick Digivolve Deck',
  'Guarding Sea Deck',
  'Black Storm Deck',
  'Toy Party Deck',
  'Flame Deck',
  'Raidra Deck',
  'Magna Deck',
  'Holse Deck A.K.A Halse Deck',
  'Shuri Deck',
  'Dig Deck',
  'Submarine Deck',
  'Pegasus Deck',
  'Baro Deck',
  'Neferti Deck',
  'Tylo Deck',
  'Shadra Deck',
  'Quetzal Deck',
]);

/**
 * Curated starter, tutorial, partner starting, and gift preset decks for quick
 * loading in the Deck Builder (while `ALL_BASE_DECKS` provides full access to all 138 decks).
 */
export const STARTER_DECKS: readonly BaseDeckDef[] = ALL_BASE_DECKS.filter((deck) =>
  STARTER_DECK_NAMES.has(deck.name),
);

// ---------------------------------------------------------------------------
// Fast Lookup Maps & Helpers
// ---------------------------------------------------------------------------

const deckByIdMap = new Map<string, BaseDeckDef>();
const opponentByIdMap = new Map<string, OpponentDef>();

function normalizeLookupKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

for (const deck of ALL_BASE_DECKS) {
  deckByIdMap.set(deck.id, deck);
  deckByIdMap.set(deck.id.toLowerCase(), deck);
  const nameKey = deck.name.toLowerCase();
  if (!deckByIdMap.has(nameKey)) {
    deckByIdMap.set(nameKey, deck);
  }
  const slugKey = normalizeLookupKey(deck.name);
  if (!deckByIdMap.has(slugKey)) {
    deckByIdMap.set(slugKey, deck);
  }
}

for (const opp of OPPONENTS) {
  opponentByIdMap.set(opp.id, opp);
  opponentByIdMap.set(opp.id.toLowerCase(), opp);
  opponentByIdMap.set(opp.deckId, opp);
  const nameKey = opp.name.toLowerCase();
  if (!opponentByIdMap.has(nameKey)) {
    opponentByIdMap.set(nameKey, opp);
  }
  const slugKey = normalizeLookupKey(opp.name);
  if (!opponentByIdMap.has(slugKey)) {
    opponentByIdMap.set(slugKey, opp);
  }
}

/**
 * Look up a base deck by its ID, exact name, or slugified name.
 */
export function getDeckById(id: string): BaseDeckDef | undefined {
  if (!id) return undefined;
  return (
    deckByIdMap.get(id) ??
    deckByIdMap.get(id.trim().toLowerCase()) ??
    deckByIdMap.get(normalizeLookupKey(id))
  );
}

/**
 * Look up an opponent by its ID, deck ID, exact duelist name, or slugified name.
 */
export function getOpponentById(id: string): OpponentDef | undefined {
  if (!id) return undefined;
  return (
    opponentByIdMap.get(id) ??
    opponentByIdMap.get(id.trim().toLowerCase()) ??
    opponentByIdMap.get(normalizeLookupKey(id))
  );
}

/**
 * Return all opponents matching the specified `DifficultyTier`.
 */
export function getOpponentsByTier(tier: DifficultyTier): OpponentDef[] {
  return OPPONENTS.filter((opp) => opp.tier === tier);
}
