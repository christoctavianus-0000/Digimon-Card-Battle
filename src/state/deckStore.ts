import { ALL_CARDS, getCardById, getCardByName } from '../data/cards';
import {
  ARMOR_TO_PARTNER_ID,
  DEFAULT_PARTNER_ARMOR,
  MAX_EQUIPPED_DIGI_PARTS,
  PARTNER_CARD_IDS,
  createDefaultPartnerConfigs,
  getDigiPartById,
} from '../data/digiParts';
import {
  ALL_BASE_DECKS,
  STARTER_DECKS,
  getDeckById,
  type BaseDeckDef,
} from '../data/opponents';
import {
  DECK_SIZE,
  MAX_COPIES,
  MAX_PARTNER_COPIES,
  type CardData,
  type CardId,
  type Level,
  type PartnerCustomization,
  type Specialty,
} from '../types/game';

export const DECK_STORE_STORAGE_KEY = 'ddcb_ps1_deck_store_v1';
export const MAX_TOTAL_PARTNERS = 3;

export interface SavedDeck {
  id: string;
  name: string;
  cards: CardId[];
  /** Optional reference to a canonical BaseDeckDef ID if loaded from a preset. */
  baseDeckId?: string;
  updatedAt: number;
}

export interface OpponentBattleRecord {
  opponentId: string;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedAt?: number;
}

export interface BattleStatsSummary {
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  byOpponent: Record<string, OpponentBattleRecord>;
}

export interface DeckStoreState {
  decks: SavedDeck[];
  activeDeckId: string;
  stats: BattleStatsSummary;
  partnerConfigs: Record<CardId, PartnerCustomization>;
}

export interface DeckValidationOptions {
  deckSize?: number;
  maxCopies?: number;
  maxPartnerCopies?: number;
  maxTotalPartners?: number;
  requireRookie?: boolean;
  allowPartnerCards?: boolean;
}

export interface DeckValidationResult {
  valid: boolean;
  isComplete: boolean;
  cardCount: number;
  errors: string[];
  warnings: string[];
  copyCounts: Record<number, number>;
  partnerCount: number;
  rookieCount: number;
}

export interface DeckAnalysis {
  totalCards: number;
  digimonCount: number;
  optionCount: number;
  bySpecialty: Record<Specialty | 'Option', number>;
  byLevel: Record<Level | 'Option', number>;
  partnerCount: number;
  armorCount: number;
  avgPlusPDigimon: number;
  avgPlusPAll: number;
  avgHpDigimon: number;
  avgDpDigimon: number;
  dominantSpecialty: Specialty | null;
}

/**
 * Returns the maximum copies allowed for a specific card in a 30-card deck.
 * Per RULES.md Section 1:
 * - Standard cards (`R`, `C`, `U`, `A`, `Option`): max 4 copies
 * - Partner Rookie cards (`level === 'R P'`): max 1 copy
 */
export function getMaxCopiesForCard(
  cardOrId: CardData | CardId,
  options?: DeckValidationOptions
): number {
  const card = typeof cardOrId === 'number' ? getCardById(cardOrId) : cardOrId;
  if (!card) return 0;
  if (card.level === 'A') {
    return 0;
  }
  if (card.level === 'R P') {
    if (options?.allowPartnerCards === false) return 0;
    return options?.maxPartnerCopies ?? MAX_PARTNER_COPIES;
  }
  return options?.maxCopies ?? MAX_COPIES;
}

/**
 * Checks if a card can be added to a deck list and returns the reason if blocked.
 */
export function canAddCardToDeck(
  currentCards: readonly CardId[],
  cardId: CardId,
  options?: DeckValidationOptions
): {
  allowed: boolean;
  reason: string | null;
  currentCount: number;
  maxAllowed: number;
} {
  const targetDeckSize = options?.deckSize ?? DECK_SIZE;
  const maxTotalPartners = options?.maxTotalPartners ?? MAX_TOTAL_PARTNERS;
  const card = getCardById(cardId);

  if (!card) {
    return {
      allowed: false,
      reason: `Unknown card ID #${cardId}`,
      currentCount: 0,
      maxAllowed: 0,
    };
  }

  if (card.level === 'A') {
    return {
      allowed: false,
      reason: 'Armor (A) cards cannot be added to a deck — they evolve directly from Partner cards.',
      currentCount: 0,
      maxAllowed: 0,
    };
  }

  const maxAllowed = getMaxCopiesForCard(card, options);
  const currentCount = currentCards.filter((id) => id === cardId).length;

  if (currentCards.length >= targetDeckSize) {
    return {
      allowed: false,
      reason: `Deck is full (${targetDeckSize}/${targetDeckSize} cards)`,
      currentCount,
      maxAllowed,
    };
  }

  if (maxAllowed === 0) {
    return {
      allowed: false,
      reason: 'Partner cards are disabled by current rules',
      currentCount,
      maxAllowed,
    };
  }

  if (currentCount >= maxAllowed) {
    return {
      allowed: false,
      reason:
        card.level === 'R P'
          ? `Max ${maxAllowed} copy per Partner (R P) card`
          : `Max ${maxAllowed} copies per card`,
      currentCount,
      maxAllowed,
    };
  }

  if (card.level === 'R P') {
    const totalPartners = currentCards.reduce((acc, id) => {
      const c = getCardById(id);
      return c?.level === 'R P' ? acc + 1 : acc;
    }, 0);
    if (totalPartners >= maxTotalPartners) {
      return {
        allowed: false,
        reason: `Max ${maxTotalPartners} Partner (R P) cards allowed per deck`,
        currentCount,
        maxAllowed,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    currentCount,
    maxAllowed,
  };
}

/**
 * Validates a deck against Digimon Digital Card Battle deck construction rules.
 */
export function validateDeck(
  cards: readonly CardId[],
  options?: DeckValidationOptions
): DeckValidationResult {
  const targetDeckSize = options?.deckSize ?? DECK_SIZE;
  const maxCopies = options?.maxCopies ?? MAX_COPIES;
  const maxPartnerCopies = options?.maxPartnerCopies ?? MAX_PARTNER_COPIES;
  const maxTotalPartners = options?.maxTotalPartners ?? MAX_TOTAL_PARTNERS;
  const requireRookie = options?.requireRookie ?? true;
  const allowPartnerCards = options?.allowPartnerCards ?? true;

  const errors: string[] = [];
  const warnings: string[] = [];
  const copyCounts: Record<number, number> = {};
  let partnerCount = 0;
  let rookieCount = 0;
  let invalidCardIds = 0;

  for (const id of cards) {
    const card = getCardById(id);
    if (!card) {
      invalidCardIds += 1;
      continue;
    }
    copyCounts[id] = (copyCounts[id] ?? 0) + 1;
    if (card.level === 'R P') {
      partnerCount += 1;
      rookieCount += 1;
    } else if (card.level === 'R') {
      rookieCount += 1;
    }
  }

  if (invalidCardIds > 0) {
    errors.push(`Deck contains ${invalidCardIds} unrecognized card ID(s).`);
  }

  const isComplete = cards.length === targetDeckSize;
  if (cards.length < targetDeckSize) {
    errors.push(
      `Deck needs ${targetDeckSize - cards.length} more card(s) (${cards.length}/${targetDeckSize}).`
    );
  } else if (cards.length > targetDeckSize) {
    errors.push(
      `Deck has ${cards.length - targetDeckSize} too many card(s) (${cards.length}/${targetDeckSize}).`
    );
  }

  for (const [idStr, count] of Object.entries(copyCounts)) {
    const id = Number(idStr);
    const card = getCardById(id);
    if (!card) continue;

    if (card.level === 'A') {
      errors.push(
        `${card.name} (#${card.no}) is an Armor (A) card and cannot be placed in a deck (evolves directly from its Partner).`
      );
      continue;
    }

    if (!allowPartnerCards && card.level === 'R P') {
      errors.push(`${card.name} (#${card.no}) is a Partner card and is not allowed.`);
      continue;
    }

    if (card.level === 'R P') {
      if (count > maxPartnerCopies) {
        errors.push(
          `Partner card ${card.name} (#${card.no}) exceeds limit (${count}/${maxPartnerCopies}).`
        );
      }
    } else if (count > maxCopies) {
      errors.push(
        `${card.name} (#${card.no}) exceeds copy limit (${count}/${maxCopies}).`
      );
    }
  }

  if (partnerCount > maxTotalPartners) {
    errors.push(
      `Deck contains ${partnerCount} Partner (R P) cards (maximum ${maxTotalPartners} allowed).`
    );
  }

  if (requireRookie && rookieCount === 0) {
    errors.push('Deck must contain at least 1 Level R or R P Rookie Digimon.');
  } else if (rookieCount > 0 && rookieCount < 6) {
    warnings.push(
      `Low Rookie count (${rookieCount}). Consider 8–12 Rookies to avoid opening hand mulligans.`
    );
  }

  return {
    valid: errors.length === 0,
    isComplete,
    cardCount: cards.length,
    errors,
    warnings,
    copyCounts,
    partnerCount,
    rookieCount,
  };
}

/**
 * Computes Specialty breakdown, Level curve, and average +P / HP / DP telemetry for a deck.
 */
export function analyzeDeck(cards: readonly CardId[]): DeckAnalysis {
  const bySpecialty: Record<Specialty | 'Option', number> = {
    Fire: 0,
    Ice: 0,
    Nature: 0,
    Darkness: 0,
    Rare: 0,
    Option: 0,
  };

  const byLevel: Record<Level | 'Option', number> = {
    R: 0,
    'R P': 0,
    A: 0,
    C: 0,
    U: 0,
    Option: 0,
  };

  let digimonCount = 0;
  let optionCount = 0;
  let partnerCount = 0;
  let armorCount = 0;
  let sumPlusP = 0;
  let sumHp = 0;
  let sumDp = 0;

  for (const id of cards) {
    const card = getCardById(id);
    if (!card) continue;

    if (card.kind === 'Option') {
      optionCount += 1;
      bySpecialty.Option += 1;
      byLevel.Option += 1;
    } else {
      digimonCount += 1;
      if (card.specialty) {
        bySpecialty[card.specialty] += 1;
      }
      if (card.level) {
        byLevel[card.level] += 1;
      }
      if (card.level === 'R P') partnerCount += 1;
      if (card.level === 'A') armorCount += 1;
      sumPlusP += card.plusP;
      sumHp += card.hp;
      sumDp += card.dp;
    }
  }

  let dominantSpecialty: Specialty | null = null;
  let maxSpecCount = 0;
  for (const spec of ['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'] as const) {
    if (bySpecialty[spec] > maxSpecCount) {
      maxSpecCount = bySpecialty[spec];
      dominantSpecialty = spec;
    }
  }

  return {
    totalCards: cards.length,
    digimonCount,
    optionCount,
    bySpecialty,
    byLevel,
    partnerCount,
    armorCount,
    avgPlusPDigimon: digimonCount > 0 ? Number((sumPlusP / digimonCount).toFixed(1)) : 0,
    avgPlusPAll: cards.length > 0 ? Number((sumPlusP / cards.length).toFixed(1)) : 0,
    avgHpDigimon: digimonCount > 0 ? Math.round(sumHp / digimonCount) : 0,
    avgDpDigimon: digimonCount > 0 ? Math.round(sumDp / digimonCount) : 0,
    dominantSpecialty,
  };
}

/**
 * Sorts a deck's card IDs in canonical order (Digimon by Specialty/Level/ID, then Options by ID).
 */
export function sortDeckCards(cards: readonly CardId[]): CardId[] {
  const levelOrder: Record<string, number> = {
    'R P': 0,
    R: 1,
    A: 2,
    C: 3,
    U: 4,
    Option: 5,
  };
  return [...cards].sort((a, b) => {
    const ca = getCardById(a);
    const cb = getCardById(b);
    if (!ca || !cb) return a - b;
    if (ca.kind !== cb.kind) return ca.kind === 'Digimon' ? -1 : 1;
    const la = levelOrder[ca.level ?? 'Option'] ?? 5;
    const lb = levelOrder[cb.level ?? 'Option'] ?? 5;
    if (la !== lb) return la - lb;
    return a - b;
  });
}

// ---------------------------------------------------------------------------
// Auto-Complete / Random Deck Builder Helper
// ---------------------------------------------------------------------------

function nextRng(state: { seed: number }): number {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 0x100000000;
}

function pickRandom<T>(items: readonly T[], rngState: { seed: number }): T | undefined {
  if (items.length === 0) return undefined;
  const idx = Math.floor(nextRng(rngState) * items.length);
  return items[idx];
}

/**
 * Auto-completes a partial deck (or empty array) up to 30 valid cards with a balanced
 * Rookie / Champion / Ultimate / Option curve matching the deck's dominant specialty.
 */
export function autoCompleteDeck(
  currentCards: readonly CardId[],
  options?: { preferredSpecialty?: Specialty; seed?: number }
): CardId[] {
  const result = currentCards
    .filter((id) => getCardById(id)?.level !== 'A')
    .slice(0, DECK_SIZE);
  const rngState = {
    seed: (options?.seed ?? Date.now() ^ 0x9e3779b9) >>> 0,
  };

  const analysis = analyzeDeck(result);
  const allSpecs: Specialty[] = ['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'];
  const primarySpec: Specialty =
    options?.preferredSpecialty ??
    analysis.dominantSpecialty ??
    pickRandom(allSpecs, rngState) ??
    'Fire';

  const countByLevel = (lvl: Level | 'Option') =>
    result.filter((id) => {
      const c = getCardById(id);
      if (!c) return false;
      return lvl === 'Option' ? c.kind === 'Option' : c.level === lvl;
    }).length;

  const tryAddFromPool = (pool: readonly CardData[], neededCount: number) => {
    let added = 0;
    let attempts = 0;
    while (result.length < DECK_SIZE && added < neededCount && attempts < 200) {
      attempts += 1;
      const candidate = pickRandom(pool, rngState);
      if (!candidate) break;
      const check = canAddCardToDeck(result, candidate.id);
      if (check.allowed) {
        // Add 2 copies at a time for consistency when space permits
        const copiesToAdd = Math.min(
          2,
          check.maxAllowed - check.currentCount,
          neededCount - added,
          DECK_SIZE - result.length
        );
        for (let i = 0; i < copiesToAdd; i++) {
          result.push(candidate.id);
          added += 1;
        }
      }
    }
  };

  const rookiesPrimary = ALL_CARDS.filter(
    (c) => c.kind === 'Digimon' && c.level === 'R' && c.specialty === primarySpec
  );
  const championsPrimary = ALL_CARDS.filter(
    (c) => c.kind === 'Digimon' && c.level === 'C' && c.specialty === primarySpec
  );
  const ultimatesPrimary = ALL_CARDS.filter(
    (c) => c.kind === 'Digimon' && c.level === 'U' && c.specialty === primarySpec
  );
  const optionsPool = ALL_CARDS.filter((c) => c.kind === 'Option' && c.id !== 200);

  // Target balanced curve: ~12 R, ~8 C, ~4 U, ~6 Option
  const currentR = countByLevel('R') + countByLevel('R P');
  if (currentR < 12) {
    tryAddFromPool(rookiesPrimary, 12 - currentR);
  }

  const currentC = countByLevel('C') + countByLevel('A');
  if (currentC < 8) {
    tryAddFromPool(championsPrimary, 8 - currentC);
  }

  const currentU = countByLevel('U');
  if (currentU < 4) {
    tryAddFromPool(ultimatesPrimary, 4 - currentU);
  }

  const currentOpt = countByLevel('Option');
  if (currentOpt < 6) {
    tryAddFromPool(optionsPool, 6 - currentOpt);
  }

  // Fill any remaining slots up to 30
  const fallbackPool = [
    ...rookiesPrimary,
    ...championsPrimary,
    ...optionsPool,
    ...ALL_CARDS.filter((c) => c.level === 'R'),
  ];
  let safety = 0;
  while (result.length < DECK_SIZE && safety < 500) {
    safety += 1;
    const candidate = pickRandom(fallbackPool, rngState);
    if (!candidate) break;
    if (canAddCardToDeck(result, candidate.id).allowed) {
      result.push(candidate.id);
    }
  }

  // Deterministic sequential fallback if still under 30
  if (result.length < DECK_SIZE) {
    for (const card of ALL_CARDS) {
      while (result.length < DECK_SIZE && canAddCardToDeck(result, card.id).allowed) {
        result.push(card.id);
      }
      if (result.length >= DECK_SIZE) break;
    }
  }

  return sortDeckCards(result);
}

/**
 * Generates a fresh 30-card valid random deck.
 */
export function generateRandomDeck(options?: {
  specialty?: Specialty;
  seed?: number;
}): CardId[] {
  return autoCompleteDeck([], {
    preferredSpecialty: options?.specialty,
    seed: options?.seed,
  });
}

// ---------------------------------------------------------------------------
// Import / Export Deck Code & JSON
// ---------------------------------------------------------------------------

/**
 * Exports a deck into a compact shareable code string:
 * `DDCB1:<DeckName>|<id>x<count>,<id>x<count>,...`
 */
export function exportDeckCode(
  deckOrCards: { name?: string; cards: readonly CardId[] } | readonly CardId[]
): string {
  const isArray = Array.isArray(deckOrCards);
  const name = isArray
    ? 'Custom Deck'
    : (deckOrCards as { name?: string }).name?.trim() || 'Custom Deck';
  const cards = isArray
    ? (deckOrCards as readonly CardId[])
    : (deckOrCards as { cards: readonly CardId[] }).cards;

  const counts = new Map<CardId, number>();
  for (const id of cards) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const pairs = Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, cnt]) => `${String(id).padStart(3, '0')}x${cnt}`)
    .join(',');

  const safeName = name.replace(/\|/g, '-');
  return `DDCB1:${safeName}|${pairs}`;
}

/**
 * Exports a deck as formatted JSON (with human-readable card entries).
 */
export function exportDeckJson(deck: {
  id?: string;
  name: string;
  cards: readonly CardId[];
}): string {
  const counts = new Map<CardId, number>();
  for (const id of deck.cards) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const entries = Array.from(counts.entries()).map(([cardId, count]) => {
    const c = getCardById(cardId);
    return {
      cardId,
      no: c?.no ?? String(cardId).padStart(3, '0'),
      name: c?.name ?? `Card #${cardId}`,
      count,
    };
  });

  return JSON.stringify(
    {
      format: 'digimon-digital-card-battle-v1',
      name: deck.name,
      cards: [...deck.cards],
      entries,
    },
    null,
    2
  );
}

/**
 * Imports a deck from a `DDCB1:...` deck code, a JSON payload, or a plain-text card list
 * (e.g. `4 Agumon`, `2x #002 WarGreymon`, etc.).
 */
export function importDeckCode(
  rawInput: string,
  fallbackName = 'Imported Deck'
): { name: string; cards: CardId[]; warnings: string[] } {
  const trimmed = rawInput.trim();
  const warnings: string[] = [];

  if (!trimmed) {
    throw new Error('Deck import input is empty.');
  }

  // 1. Check `DDCB1:` compact format
  if (trimmed.startsWith('DDCB1:')) {
    const body = trimmed.slice('DDCB1:'.length);
    const pipeIdx = body.indexOf('|');
    const name =
      pipeIdx >= 0 && body.slice(0, pipeIdx).trim()
        ? body.slice(0, pipeIdx).trim()
        : fallbackName;
    const listPart = pipeIdx >= 0 ? body.slice(pipeIdx + 1).trim() : body.trim();

    const cards: CardId[] = [];
    if (listPart) {
      const tokens = listPart.split(',');
      for (const tok of tokens) {
        const cleanTok = tok.trim();
        if (!cleanTok) continue;
        const m = cleanTok.match(/^#?(\d+)(?:x(\d+))?$/i);
        if (!m) {
          warnings.push(`Ignored invalid token "${cleanTok}".`);
          continue;
        }
        const cardId = parseInt(m[1], 10);
        const count = m[2] ? parseInt(m[2], 10) : 1;
        const card = getCardById(cardId);
        if (!card) {
          warnings.push(`Unknown card ID #${cardId}.`);
          continue;
        }
        for (let i = 0; i < count; i++) {
          cards.push(card.id);
        }
      }
    }
    return { name, cards, warnings };
  }

  // 2. Check JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const cards: CardId[] = [];
        for (const item of parsed) {
          if (typeof item === 'number' && getCardById(item)) {
            cards.push(item);
          } else if (
            item &&
            typeof item === 'object' &&
            typeof item.cardId === 'number'
          ) {
            const cnt = typeof item.count === 'number' ? item.count : 1;
            if (getCardById(item.cardId)) {
              for (let i = 0; i < cnt; i++) cards.push(item.cardId);
            }
          }
        }
        return { name: fallbackName, cards, warnings };
      }

      if (parsed && typeof parsed === 'object') {
        const name =
          typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name.trim()
            : fallbackName;
        const cards: CardId[] = [];

        if (Array.isArray(parsed.cards)) {
          for (const id of parsed.cards) {
            const numId = Number(id);
            if (!Number.isNaN(numId) && getCardById(numId)) {
              cards.push(numId);
            } else {
              warnings.push(`Unknown card ID in JSON: ${String(id)}`);
            }
          }
        } else if (Array.isArray(parsed.entries)) {
          for (const entry of parsed.entries) {
            const cid = Number(entry?.cardId);
            const cnt = Number(entry?.count ?? 1);
            if (!Number.isNaN(cid) && getCardById(cid) && cnt > 0) {
              for (let i = 0; i < cnt; i++) cards.push(cid);
            }
          }
        }
        return { name, cards, warnings };
      }
    } catch {
      throw new Error('Invalid JSON deck format.');
    }
  }

  // 3. Plain-text line-by-line or comma-separated deck list
  const lines = trimmed
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);

  let detectedName = fallbackName;
  const cards: CardId[] = [];

  for (const line of lines) {
    if (/^(?:deck|name)\s*:/i.test(line)) {
      const possibleName = line.replace(/^(?:deck|name)\s*:\s*/i, '').trim();
      if (possibleName) detectedName = possibleName;
      continue;
    }

    // e.g. "4 Agumon", "4x Agumon", "4 #020 Greymon", "#000 Imperialdramon x1", "Agumon x4"
    let count = 1;
    let cardQuery = line;

    const leadingCountMatch = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
    const trailingCountMatch = line.match(/^(.+?)\s+[x×](\d+)$/i);

    if (leadingCountMatch) {
      count = parseInt(leadingCountMatch[1], 10);
      cardQuery = leadingCountMatch[2].trim();
    } else if (trailingCountMatch) {
      cardQuery = trailingCountMatch[1].trim();
      count = parseInt(trailingCountMatch[2], 10);
    }

    // Strip leading "#000 " if present, or resolve by #000 directly
    let resolved: CardData | undefined;
    const idPrefixMatch = cardQuery.match(/^#(\d{1,3})(?:\s+(.*))?$/);
    if (idPrefixMatch) {
      resolved = getCardById(parseInt(idPrefixMatch[1], 10));
      if (!resolved && idPrefixMatch[2]) {
        resolved = getCardByName(idPrefixMatch[2]);
      }
    } else if (/^\d{1,3}$/.test(cardQuery)) {
      resolved = getCardById(parseInt(cardQuery, 10));
    } else {
      resolved = getCardByName(cardQuery);
    }

    if (!resolved) {
      warnings.push(`Could not resolve card "${line}".`);
      continue;
    }

    const safeCount = Math.max(1, Math.min(30, count));
    for (let i = 0; i < safeCount; i++) {
      cards.push(resolved.id);
    }
  }

  if (cards.length === 0) {
    throw new Error('Could not parse any valid cards from the provided input.');
  }

  return { name: detectedName, cards, warnings };
}

// ---------------------------------------------------------------------------
// Default Starter Decks & Store Initialization
// ---------------------------------------------------------------------------

export function createDefaultDecks(): SavedDeck[] {
  const defaultTargets = [
    'Tricolor Starter Deck',
    'Burning Hot! Deck',
    'Guarding Sea Deck',
    'New Power Deck',
    'Black Storm Deck',
    'Flame Deck',
  ];

  const pickedBaseDecks: BaseDeckDef[] = [];
  for (const targetName of defaultTargets) {
    const found =
      STARTER_DECKS.find((d) => d.name.toLowerCase() === targetName.toLowerCase()) ??
      getDeckById(targetName);
    if (found && !pickedBaseDecks.some((p) => p.id === found.id)) {
      pickedBaseDecks.push(found);
    }
  }

  // Fallback to first available starter/base decks if any weren't found
  const fallbackSource = STARTER_DECKS.length > 0 ? STARTER_DECKS : ALL_BASE_DECKS;
  for (const d of fallbackSource) {
    if (pickedBaseDecks.length >= 5) break;
    if (!pickedBaseDecks.some((p) => p.id === d.id)) {
      pickedBaseDecks.push(d);
    }
  }

  const now = Date.now();
  return pickedBaseDecks.map((base, idx) => ({
    id: `deck_${idx + 1}`,
    name: base.name,
    cards: [...base.cards],
    baseDeckId: base.id,
    updatedAt: now,
  }));
}

export function createDefaultDeckStoreState(): DeckStoreState {
  const decks = createDefaultDecks();
  return {
    decks,
    activeDeckId: decks[0]?.id ?? 'deck_1',
    stats: {
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      byOpponent: {},
    },
    partnerConfigs: createDefaultPartnerConfigs(),
  };
}

// ---------------------------------------------------------------------------
// localStorage Persistence & State Mutators
// ---------------------------------------------------------------------------

export function loadDeckStore(storageKey = DECK_STORE_STORAGE_KEY): DeckStoreState {
  const fallback = createDefaultDeckStoreState();
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DeckStoreState>;

    const decks =
      Array.isArray(parsed.decks) && parsed.decks.length > 0
        ? parsed.decks.map((d, idx) => {
            const rawValidCards = Array.isArray(d.cards)
              ? d.cards.map(Number).filter((n) => !Number.isNaN(n) && Boolean(getCardById(n)))
              : [];
            const withoutArmor = rawValidCards.filter((n) => getCardById(n)?.level !== 'A');
            const cards =
              rawValidCards.length === DECK_SIZE && withoutArmor.length < DECK_SIZE
                ? autoCompleteDeck(withoutArmor, { seed: (idx + 1) * 7919 })
                : withoutArmor;
            return {
              id: typeof d.id === 'string' && d.id ? d.id : `deck_${idx + 1}`,
              name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : `Deck ${idx + 1}`,
              cards,
              ...(d.baseDeckId ? { baseDeckId: d.baseDeckId } : {}),
              updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
            };
          })
        : fallback.decks;

    const activeDeckId =
      typeof parsed.activeDeckId === 'string' &&
      decks.some((d) => d.id === parsed.activeDeckId)
        ? parsed.activeDeckId
        : decks[0].id;

    const stats: BattleStatsSummary = {
      totalWins: Number(parsed.stats?.totalWins ?? 0),
      totalLosses: Number(parsed.stats?.totalLosses ?? 0),
      totalDraws: Number(parsed.stats?.totalDraws ?? 0),
      byOpponent:
        parsed.stats?.byOpponent && typeof parsed.stats.byOpponent === 'object'
          ? { ...parsed.stats.byOpponent }
          : {},
    };

    const partnerConfigs = createDefaultPartnerConfigs();
    if (parsed.partnerConfigs && typeof parsed.partnerConfigs === 'object') {
      for (const partnerId of PARTNER_CARD_IDS) {
        const rawEntry = (parsed.partnerConfigs as Record<number, Partial<PartnerCustomization>>)[
          partnerId
        ];
        if (!rawEntry) continue;
        const equippedSet: number[] = [];
        if (Array.isArray(rawEntry.equippedParts)) {
          for (const pid of rawEntry.equippedParts) {
            const numId = Number(pid);
            if (
              !Number.isNaN(numId) &&
              getDigiPartById(numId) &&
              !equippedSet.includes(numId) &&
              equippedSet.length < MAX_EQUIPPED_DIGI_PARTS
            ) {
              equippedSet.push(numId);
            }
          }
        }
        const rawArmor = Number(rawEntry.selectedArmorCardId);
        const selectedArmorCardId =
          !Number.isNaN(rawArmor) && ARMOR_TO_PARTNER_ID[rawArmor] === partnerId
            ? rawArmor
            : DEFAULT_PARTNER_ARMOR[partnerId]!;
        partnerConfigs[partnerId] = {
          equippedParts: equippedSet,
          selectedArmorCardId,
        };
      }
    }

    return {
      decks,
      activeDeckId,
      stats,
      partnerConfigs,
    };
  } catch {
    return fallback;
  }
}

export function saveDeckStore(
  state: DeckStoreState,
  storageKey = DECK_STORE_STORAGE_KEY
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function resetDeckStore(storageKey = DECK_STORE_STORAGE_KEY): DeckStoreState {
  const fresh = createDefaultDeckStoreState();
  saveDeckStore(fresh, storageKey);
  return fresh;
}

export function getActiveDeck(state: DeckStoreState): SavedDeck {
  return (
    state.decks.find((d) => d.id === state.activeDeckId) ??
    state.decks[0] ?? {
      id: 'deck_1',
      name: 'Starter Deck',
      cards: createDefaultDecks()[0]?.cards ?? [],
      updatedAt: Date.now(),
    }
  );
}

export function selectActiveDeck(
  state: DeckStoreState,
  deckId: string
): DeckStoreState {
  if (!state.decks.some((d) => d.id === deckId)) {
    return state;
  }
  const next: DeckStoreState = {
    ...state,
    activeDeckId: deckId,
  };
  saveDeckStore(next);
  return next;
}

export function createDeck(
  state: DeckStoreState,
  name: string,
  cards: readonly CardId[] = [],
  baseDeckId?: string
): DeckStoreState {
  const uniqueId = `deck_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newDeck: SavedDeck = {
    id: uniqueId,
    name: name.trim() || `Custom Deck ${state.decks.length + 1}`,
    cards: [...cards],
    ...(baseDeckId ? { baseDeckId } : {}),
    updatedAt: Date.now(),
  };

  const next: DeckStoreState = {
    ...state,
    decks: [...state.decks, newDeck],
    activeDeckId: newDeck.id,
  };
  saveDeckStore(next);
  return next;
}

export function updateDeck(
  state: DeckStoreState,
  deckId: string,
  patch: { name?: string; cards?: readonly CardId[]; baseDeckId?: string | undefined }
): DeckStoreState {
  const nextDecks = state.decks.map((d) => {
    if (d.id !== deckId) return d;
    return {
      ...d,
      name: patch.name !== undefined ? patch.name.trim() || d.name : d.name,
      cards: patch.cards !== undefined ? [...patch.cards] : d.cards,
      baseDeckId: 'baseDeckId' in patch ? patch.baseDeckId : d.baseDeckId,
      updatedAt: Date.now(),
    };
  });

  const next: DeckStoreState = {
    ...state,
    decks: nextDecks,
  };
  saveDeckStore(next);
  return next;
}

export function renameDeck(
  state: DeckStoreState,
  deckId: string,
  newName: string
): DeckStoreState {
  return updateDeck(state, deckId, { name: newName });
}

export function duplicateDeck(
  state: DeckStoreState,
  deckId: string,
  newName?: string
): DeckStoreState {
  const source = state.decks.find((d) => d.id === deckId);
  if (!source) return state;
  return createDeck(
    state,
    newName?.trim() || `${source.name} (Copy)`,
    source.cards,
    source.baseDeckId
  );
}

export function deleteDeck(
  state: DeckStoreState,
  deckId: string
): DeckStoreState {
  if (state.decks.length <= 1) {
    return state;
  }
  const remaining = state.decks.filter((d) => d.id !== deckId);
  const nextActiveId =
    state.activeDeckId === deckId ? remaining[0].id : state.activeDeckId;

  const next: DeckStoreState = {
    ...state,
    decks: remaining,
    activeDeckId: nextActiveId,
  };
  saveDeckStore(next);
  return next;
}

/**
 * Loads any of the 138 canonical GameFAQs base decks or starter decks into either
 * an existing deck slot (`targetDeckId`) or a newly created slot (`'new'`).
 */
export function loadBaseDeckIntoSlot(
  state: DeckStoreState,
  targetDeckId: string | 'new',
  baseDeckOrId: BaseDeckDef | string
): DeckStoreState {
  const baseDeck =
    typeof baseDeckOrId === 'string' ? getDeckById(baseDeckOrId) : baseDeckOrId;
  if (!baseDeck) return state;

  if (targetDeckId === 'new') {
    return createDeck(state, baseDeck.name, baseDeck.cards, baseDeck.id);
  }

  return updateDeck(state, targetDeckId, {
    name: baseDeck.name,
    cards: [...baseDeck.cards],
    baseDeckId: baseDeck.id,
  });
}

/**
 * Records a win, loss, or draw against an opponent and persists to `localStorage`.
 */
export function recordMatchResult(
  state: DeckStoreState,
  opponentId: string,
  outcome: 'win' | 'loss' | 'draw'
): DeckStoreState {
  const prevOpp: OpponentBattleRecord = state.stats.byOpponent[opponentId] ?? {
    opponentId,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
  };

  const nextWins = prevOpp.wins + (outcome === 'win' ? 1 : 0);
  const nextLosses = prevOpp.losses + (outcome === 'loss' ? 1 : 0);
  const nextDraws = prevOpp.draws + (outcome === 'draw' ? 1 : 0);
  const nextStreak = outcome === 'win' ? prevOpp.currentStreak + 1 : 0;
  const nextBestStreak = Math.max(prevOpp.bestStreak, nextStreak);

  const nextOppRecord: OpponentBattleRecord = {
    opponentId,
    wins: nextWins,
    losses: nextLosses,
    draws: nextDraws,
    currentStreak: nextStreak,
    bestStreak: nextBestStreak,
    lastPlayedAt: Date.now(),
  };

  const next: DeckStoreState = {
    ...state,
    stats: {
      totalWins: state.stats.totalWins + (outcome === 'win' ? 1 : 0),
      totalLosses: state.stats.totalLosses + (outcome === 'loss' ? 1 : 0),
      totalDraws: state.stats.totalDraws + (outcome === 'draw' ? 1 : 0),
      byOpponent: {
        ...state.stats.byOpponent,
        [opponentId]: nextOppRecord,
      },
    },
  };

  saveDeckStore(next);
  return next;
}

/**
 * Updates a Partner card's customization (`equippedParts` or `selectedArmorCardId`) and persists.
 */
export function updatePartnerConfig(
  state: DeckStoreState,
  partnerCardId: CardId,
  patch: Partial<PartnerCustomization>
): DeckStoreState {
  if (!PARTNER_CARD_IDS.includes(partnerCardId)) return state;
  const current = state.partnerConfigs[partnerCardId] ?? {
    equippedParts: [],
    selectedArmorCardId: DEFAULT_PARTNER_ARMOR[partnerCardId]!,
  };

  const nextEquipped = patch.equippedParts
    ? patch.equippedParts
        .filter((pid, idx, arr) => Boolean(getDigiPartById(pid)) && arr.indexOf(pid) === idx)
        .slice(0, MAX_EQUIPPED_DIGI_PARTS)
    : current.equippedParts;

  const nextArmor =
    patch.selectedArmorCardId !== undefined &&
    ARMOR_TO_PARTNER_ID[patch.selectedArmorCardId] === partnerCardId
      ? patch.selectedArmorCardId
      : current.selectedArmorCardId;

  const next: DeckStoreState = {
    ...state,
    partnerConfigs: {
      ...state.partnerConfigs,
      [partnerCardId]: {
        equippedParts: nextEquipped,
        selectedArmorCardId: nextArmor,
      },
    },
  };
  saveDeckStore(next);
  return next;
}

/**
 * Toggles or equips a Digi-Part onto a Partner card (max 3 parts).
 * Exclusive categories (`xEffect` and `support`) replace any previously equipped part in that same category.
 */
export function equipDigiPartToPartner(
  state: DeckStoreState,
  partnerCardId: CardId,
  partId: number
): DeckStoreState {
  const part = getDigiPartById(partId);
  if (!part || !PARTNER_CARD_IDS.includes(partnerCardId)) return state;

  const current = state.partnerConfigs[partnerCardId] ?? {
    equippedParts: [],
    selectedArmorCardId: DEFAULT_PARTNER_ARMOR[partnerCardId]!,
  };

  if (current.equippedParts.includes(partId)) {
    return updatePartnerConfig(state, partnerCardId, {
      equippedParts: current.equippedParts.filter((id) => id !== partId),
    });
  }

  let nextParts = [...current.equippedParts];
  if (part.category === 'xEffect' || part.category === 'support') {
    nextParts = nextParts.filter((id) => getDigiPartById(id)?.category !== part.category);
  }

  if (nextParts.length >= MAX_EQUIPPED_DIGI_PARTS) {
    return state;
  }

  nextParts.push(partId);
  return updatePartnerConfig(state, partnerCardId, {
    equippedParts: nextParts,
  });
}

/**
 * Resets all Partner cards' Digi-Parts and Armor selections back to defaults.
 */
export function resetPartnerConfigs(state: DeckStoreState): DeckStoreState {
  const next: DeckStoreState = {
    ...state,
    partnerConfigs: createDefaultPartnerConfigs(),
  };
  saveDeckStore(next);
  return next;
}
