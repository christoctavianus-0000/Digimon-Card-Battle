import type { CardData, CardId } from '../types/game';
import { GENERATED_CARDS } from './cards.generated';

export const ALL_CARDS: readonly CardData[] = GENERATED_CARDS;

const cardByIdMap = new Map<CardId, CardData>();
const cardByExactKeyMap = new Map<string, CardData>();
const cardBySlugKeyMap = new Map<string, CardData>();

/**
 * Known GameFAQs / deck-list spelling & symbol aliases mapped to canonical card names.
 */
const CANONICAL_NAME_ALIASES: Record<string, string> = {
  'attack disk o': 'Attack Disk ○',
  'attack disk circle': 'Attack Disk ○',
  'attack disk triangle': 'Attack Disk △',
  'attack disk x': 'Attack Disk ×',
  'attack disk cross': 'Attack Disk ×',
  'defense disk o': 'Defense Disk ○',
  'defense disk circle': 'Defense Disk ○',
  'defense disk triangle': 'Defense Disk △',
  'defense disk x': 'Defense Disk ×',
  'defense disk cross': 'Defense Disk ×',
  'mega def. disk o': 'Mega Def. Disk ○',
  'mega def disk o': 'Mega Def. Disk ○',
  'mega def. disk circle': 'Mega Def. Disk ○',
  'mega def. disk triangle': 'Mega Def. Disk △',
  'mega def disk triangle': 'Mega Def. Disk △',
  'mega def. disk x': 'Mega Def. Disk ×',
  'mega def disk x': 'Mega Def. Disk ×',
  'mega def. disk cross': 'Mega Def. Disk ×',
  'special digivolv': 'Special Digivolve',
  'speed digivolv': 'Speed Digivolve',
  'sylphymon': 'Silphymon',
  'dokunemmon': 'Dokunemon',
};

/**
 * Normalizes a card name by stripping Partner deck annotations (`[no armor]`, `--- no armor`),
 * unifying curly apostrophes, and collapsing whitespace.
 */
export function normalizeCardName(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'")
    .replace(/\s*\[no\s+armor\]\s*$/i, '')
    .replace(/\s*-+\s*no\s+armor\s*$/i, '')
    .replace(/\s*\(no\s+armor\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSlugKey(name: string): string {
  return normalizeCardName(name)
    .toLowerCase()
    .replace(/[^a-z0-9\u25cb\u25b3\u00d7]/g, '');
}

for (const card of ALL_CARDS) {
  cardByIdMap.set(card.id, card);
  const exactKey = normalizeCardName(card.name).toLowerCase();
  cardByExactKeyMap.set(exactKey, card);
  cardBySlugKeyMap.set(toSlugKey(card.name), card);
}

/**
 * Look up a card by its numeric ID (0..300).
 */
export function getCardById(id: CardId): CardData | undefined {
  return cardByIdMap.get(id);
}

/**
 * Look up a card by its numeric ID (0..300), throwing if not found.
 */
export function mustGetCardById(id: CardId): CardData {
  const card = cardByIdMap.get(id);
  if (!card) {
    throw new Error(`Card with ID ${id} not found`);
  }
  return card;
}

/**
 * Case-insensitive, punctuation-tolerant card lookup by name.
 * Handles GameFAQs deck-list aliases, `[no armor]` / `--- no armor` suffixes,
 * disk symbol aliases (O / Triangle / X -> ○ / △ / ×), and curly apostrophes.
 */
export function getCardByName(rawName: string): CardData | undefined {
  if (!rawName) return undefined;
  const cleaned = normalizeCardName(rawName);
  const lower = cleaned.toLowerCase();

  const aliasTarget = CANONICAL_NAME_ALIASES[lower];
  if (aliasTarget) {
    return cardByExactKeyMap.get(aliasTarget.toLowerCase());
  }

  const direct = cardByExactKeyMap.get(lower);
  if (direct) return direct;

  const slug = toSlugKey(cleaned);
  return cardBySlugKeyMap.get(slug);
}

/**
 * Resolves a card's image URL respecting Vite's `import.meta.env.BASE_URL`.
 */
export function getCardImageUrl(cardOrPath: CardData | string): string {
  const relPath = (typeof cardOrPath === 'string' ? cardOrPath : cardOrPath.image).replace(/^\/+/, '');
  const baseUrl =
    typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : './';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${relPath}`;
}
