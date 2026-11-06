import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DECK_LIST_PATH = path.join(ROOT_DIR, 'docs', 'base-deck-list..txt');
const CARDS_GENERATED_PATH = path.join(ROOT_DIR, 'src', 'data', 'cards.generated.ts');
const OUTPUT_PATH = path.join(ROOT_DIR, 'src', 'data', 'decks.generated.ts');

// ---------------------------------------------------------------------------
// Load GENERATED_CARDS from src/data/cards.generated.ts
// ---------------------------------------------------------------------------
const cardsTsSource = fs.readFileSync(CARDS_GENERATED_PATH, 'utf8');
const assignIdx = cardsTsSource.indexOf('= [');
const jsonStart = assignIdx !== -1 ? assignIdx + 2 : -1;
const jsonEnd = cardsTsSource.lastIndexOf(']');
if (jsonStart === -1 || jsonEnd === -1) {
  throw new Error('Could not parse GENERATED_CARDS array from src/data/cards.generated.ts');
}
/** @type {Array<{id: number, no: string, name: string, kind: string, level: string | null, specialty: string | null, isPartner: boolean, hp: number, dp: number, plusP: number}>} */
const ALL_CARDS = JSON.parse(cardsTsSource.slice(jsonStart, jsonEnd + 1));

const CANONICAL_NAME_ALIASES = {
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

function normalizeCardName(raw) {
  return raw
    .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'")
    .replace(/\s*\[no\s+armor\]\s*$/i, '')
    .replace(/\s*-+\s*no\s+armor\s*$/i, '')
    .replace(/\s*\(no\s+armor\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSlugKey(name) {
  return normalizeCardName(name)
    .toLowerCase()
    .replace(/[^a-z0-9\u25cb\u25b3\u00d7]/g, '');
}

const cardByIdMap = new Map();
const cardByExactKeyMap = new Map();
const cardBySlugKeyMap = new Map();

for (const card of ALL_CARDS) {
  cardByIdMap.set(card.id, card);
  const exactKey = normalizeCardName(card.name).toLowerCase();
  cardByExactKeyMap.set(exactKey, card);
  cardBySlugKeyMap.set(toSlugKey(card.name), card);
}

function getCardByName(rawName) {
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

function slugifyId(str) {
  return str
    .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Duelist Representative Card Overrides (for human tamers & special bosses)
// ---------------------------------------------------------------------------
const DUELIST_CARD_OVERRIDES = {
  'babamon': 'Rosemon',
  'kingsukamon': 'Sukamon',
  'digimon emperor': 'GranKuwagamon',
  'davis': 'Flamedramon',
  'keely': 'Halsemon',
  'cody': 'Digmon',
  't.k.': 'Pegasusmon',
  'kari': 'Nefertimon',
  'tai': 'WarGreymon',
  'sora': 'Garudamon',
  'mimi': 'Lillymon',
  'matt': 'MetalSeadramon',
  'joe': 'Zudomon',
  'izzy': 'MegaKabuterimon',
  'ken': 'GranKuwagamon',
  'metalgarurumon': 'WereGarurumon',
  'metalgreymon': 'RealMetalGreymon',
  'omnimon': 'Omnimon I',
  'bk wargreymon': 'WarGreymon',
  'bk metalgarurumon': 'MetalSeadramon',
  'analogman': 'Apokarimon',
  'a "analogman"': 'Apokarimon',
};

const BOSS_ULTIMATE_NAMES = new Set([
  'Imperialdramon',
  'Omnimon I',
  'Omnimon II',
  'WarGreymon',
  'MetalSeadramon',
  'Vikemon',
  'Valkyrimon',
  'Seraphimon',
  'Magnadramon',
  'HerculesKabuterimon',
  'Rosemon',
  'Apokarimon',
  'Diaboromon',
  'VenomMyotismon',
  'Machinedramon',
  'Piedmon',
  'GranKuwagamon',
  'Puppetmon',
  'SuperStarmon',
  'Paildramon',
  'Silphymon',
  'Shakkoumon',
]);

const SEVENS_CARDS = new Set([
  'Wild Sevens',
  'Holy Sevens',
  'Dark Sevens',
  'Grand Sevens',
  'Mystic Sevens',
  'Speed Sevens',
  'Reverse Sevens',
  'Fake Sevens',
  'Download Digivolve',
]);

/**
 * Determine the difficulty tier ('Easy' | 'Normal' | 'Hard' | 'Expert')
 * from deck composition and GameFAQs progression index.
 */
function classifyDifficultyTier(deckIndex, deckName, ownerRaw, entries, preserveExactOrder) {
  const lowerName = deckName.toLowerCase();
  const lowerOwner = ownerRaw.toLowerCase();

  // Starter, tutorial, and gift decks at the beginning or end of the file are Easy
  if (
    lowerName.includes('tutorial') ||
    lowerName.includes('starter') ||
    lowerName.includes('practice deck') ||
    lowerOwner.includes('starting deck') ||
    lowerOwner.includes('given from')
  ) {
    return 'Easy';
  }

  let ultimateCount = 0;
  let championCount = 0;
  let rookieCount = 0;
  let bossCardCount = 0;
  let sevensCount = 0;

  for (const { cardId, count } of entries) {
    const card = cardByIdMap.get(cardId);
    if (!card) continue;
    if (card.level === 'U') ultimateCount += count;
    else if (card.level === 'C' || card.level === 'A') championCount += count;
    else if (card.level === 'R' || card.level === 'R P') rookieCount += count;

    if (BOSS_ULTIMATE_NAMES.has(card.name)) {
      bossCardCount += count;
    }
    if (SEVENS_CARDS.has(card.name)) {
      sevensCount += count;
    }
  }

  // Analogman, Pick Up Deck, Sevens decks, or end-game boss decks (index >= 90 with strong Ultimates)
  if (
    preserveExactOrder ||
    sevensCount >= 2 ||
    lowerName.includes('pick up deck') ||
    (deckIndex >= 82 && (ultimateCount >= 3 || bossCardCount >= 2)) ||
    (bossCardCount >= 4 && deckIndex >= 50)
  ) {
    return 'Expert';
  }

  // Early-game opponents (first ~22 decks) with low Ultimate count or rookie-heavy decks
  if (
    deckIndex < 18 ||
    (ultimateCount === 0 && rookieCount >= 12) ||
    (deckIndex < 30 && ultimateCount <= 1)
  ) {
    return 'Easy';
  }

  // Mid-early to mid-game balanced Champion / light-Ultimate decks
  if (deckIndex < 58 && ultimateCount <= 3 && sevensCount === 0) {
    return 'Normal';
  }

  if (ultimateCount <= 1 && bossCardCount === 0 && sevensCount === 0) {
    return 'Normal';
  }

  // Late-mid and late-game synergy / Ultimate-focused decks
  if (deckIndex >= 95 && ultimateCount >= 2) {
    return 'Expert';
  }

  return 'Hard';
}

function chooseRepresentativeCardId(duelistName, armorCardId, entries) {
  // 1. Check direct card name match for duelist name (stripping parentheticals like "(first deck)")
  const baseDuelist = duelistName
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/^A\s+["“]|["”]$/g, '')
    .trim();

  const directCard = getCardByName(baseDuelist);
  if (directCard) {
    return directCard.id;
  }

  // 2. Check explicit override table for human tamers / bosses
  const overrideTarget = DUELIST_CARD_OVERRIDES[baseDuelist.toLowerCase()];
  if (overrideTarget) {
    const overrideCard = getCardByName(overrideTarget);
    if (overrideCard) return overrideCard.id;
  }

  // 3. If deck has an explicit Armor card, use it for Armor gift decks
  if (typeof armorCardId === 'number') {
    return armorCardId;
  }

  // 4. Otherwise pick the highest-level / highest-HP Digimon card in the deck
  const levelRank = { U: 4, A: 3, C: 2, 'R P': 1, R: 1 };
  let bestCardId = entries[0]?.cardId ?? 0;
  let bestScore = -1;

  for (const { cardId } of entries) {
    const card = cardByIdMap.get(cardId);
    if (!card || card.kind !== 'Digimon') continue;
    const rank = levelRank[card.level ?? 'R'] ?? 0;
    const score = rank * 10000 + card.hp;
    if (score > bestScore) {
      bestScore = score;
      bestCardId = card.id;
    }
  }

  return bestCardId;
}

// Known GameFAQs transcription count typos (raw counts 31 and 29 on consecutive decks #96 and #97)
const KNOWN_GAMEFAQS_COUNT_ERRATA = {
  'Black King Deck': { cardName: 'Sharmamon', adjustedCount: 3 }, // GameFAQs lists 4 (total 31) -> 3 (total 30)
  'Wormhole Deck': { cardName: 'Kokuwamon', adjustedCount: 2 }, // GameFAQs lists 1 (total 29) -> 2 (total 30)
};

function buildFlavorQuote(duelistName, deckName, colors, tier, note) {
  if (note && note.startsWith('[') && note.endsWith(']')) {
    const cleanNote = note.slice(1, -1);
    return `${deckName} (${colors}) — ${cleanNote}.`;
  }
  const tierLabel =
    tier === 'Easy'
      ? 'Beginner Arena challenger'
      : tier === 'Normal'
        ? 'Intermediate Battle Cafe duelist'
        : tier === 'Hard'
          ? 'Veteran Arena master'
          : 'Elite Post-Game / Boss duelist';
  return `${duelistName} wields the ${deckName} (${colors}) — ${tierLabel}.`;
}

// ---------------------------------------------------------------------------
// Parse docs/base-deck-list..txt
// ---------------------------------------------------------------------------
const rawDeckList = fs.readFileSync(DECK_LIST_PATH, 'utf8').replace(/\r\n/g, '\n');
const sections = rawDeckList.split(/^={10,}\s*$/m);

// sections[0] is preamble; then pairs of (header, body)
const parsedDecks = [];

for (let i = 1; i < sections.length; i += 2) {
  const headerRaw = sections[i]?.trim();
  const bodyRaw = sections[i + 1]?.trim();
  if (!headerRaw || !bodyRaw) continue;

  const deckIndex = parsedDecks.length;
  const headerLines = headerRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (headerLines.length < 3) {
    throw new Error(`Unexpected header format at deck #${deckIndex + 1}:\n${headerRaw}`);
  }

  const deckName = headerLines[0].replace(/[\u2018\u2019]/g, "'");
  const colorsLine = headerLines[1];
  const colors = colorsLine.replace(/^\(|\)$/g, '').trim();

  let owner = headerLines[2].replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  let duelistName = owner;
  let location;
  let note;
  let preserveExactOrder = false;
  let armorCardId;
  let armorInfo;

  // Check remaining header lines (lines 2+)
  const extraHeaderLines = headerLines.slice(2);
  if (
    extraHeaderLines.length >= 2 &&
    /^\[.+\]$/.test(extraHeaderLines[0]) &&
    !/^\[(?:given|veemon|hawkmon|armadillomon)/i.test(extraHeaderLines[0])
  ) {
    // e.g. [Desert Island] \n Devimon
    location = extraHeaderLines[0].slice(1, -1).trim();
    const rawDuelist = extraHeaderLines[1].replace(/[\u2018\u2019]/g, "'").trim();
    duelistName = `${rawDuelist} (${location})`;
    owner = `${rawDuelist} [${location}]`;
  } else if (extraHeaderLines.length >= 1) {
    // Check if line 2 is a starter/gift bracket note like [Veemon's starting deck]
    if (/^\[.+\]$/.test(owner)) {
      note = owner;
      if (/veemon.*starting/i.test(owner)) {
        duelistName = 'Veemon (Starter)';
      } else if (/hawkmon.*starting/i.test(owner)) {
        duelistName = 'Hawkmon (Starter)';
      } else if (/armadillomon.*starting/i.test(owner)) {
        duelistName = 'Armadillomon (Starter)';
      } else {
        const giverMatch = owner.match(/given from ([^,\]]+)/i);
        const giftTarget = giverMatch ? giverMatch[1].trim() : 'Partner';
        duelistName = `${giftTarget} (${deckName.replace(/\s+Deck$/i, '')})`;
      }
    } else if (/analogman/i.test(owner)) {
      duelistName = 'Analogman';
    }

    for (let h = 1; h < extraHeaderLines.length; h++) {
      const hl = extraHeaderLines[h];
      if (/exact order/i.test(hl)) {
        preserveExactOrder = true;
        note = hl.replace(/^\(|\)$/g, '').trim();
      } else if (/^Armor:\s*/i.test(hl)) {
        armorInfo = hl.replace(/^Armor:\s*/i, '').trim();
        const armorNameMatch = armorInfo.match(/^([A-Za-z0-9-]+)\s*\(/);
        if (armorNameMatch) {
          const armorCard = getCardByName(armorNameMatch[1]);
          if (armorCard) armorCardId = armorCard.id;
        }
      }
    }
  }

  // Parse body lines
  const bodyLines = bodyRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  /** @type {Array<{cardId: number, count: number}>} */
  const entries = [];
  const entryMap = new Map();
  /** @type {number[]} */
  const cards = [];
  const disableArmorSet = new Set();

  for (const line of bodyLines) {
    if (/^Armor:\s*/i.test(line)) {
      armorInfo = line.replace(/^Armor:\s*/i, '').trim();
      const armorNameMatch = armorInfo.match(/^([A-Za-z0-9-]+)\s*\(/);
      if (!armorNameMatch) {
        throw new Error(`Could not parse Armor name from line "${line}" in deck "${deckName}"`);
      }
      const armorCard = getCardByName(armorNameMatch[1]);
      if (!armorCard) {
        throw new Error(`Unknown Armor card "${armorNameMatch[1]}" in deck "${deckName}"`);
      }
      armorCardId = armorCard.id;
      continue;
    }

    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      throw new Error(`Unrecognized card line "${line}" in deck "${deckName}"`);
    }

    let count = parseInt(match[1], 10);
    const rawCardName = match[2].trim();
    const hasNoArmorFlag =
      /\[no\s+armor\]/i.test(rawCardName) ||
      /-+\s*no\s+armor/i.test(rawCardName) ||
      /\(no\s+armor\)/i.test(rawCardName);

    const card = getCardByName(rawCardName);
    if (!card) {
      throw new Error(`Unknown card "${rawCardName}" in deck "${deckName}" (deck #${deckIndex + 1})`);
    }

    const erratum = KNOWN_GAMEFAQS_COUNT_ERRATA[deckName];
    if (erratum && card.name.toLowerCase() === erratum.cardName.toLowerCase()) {
      count = erratum.adjustedCount;
    }

    if (hasNoArmorFlag) {
      disableArmorSet.add(card.id);
    }

    for (let c = 0; c < count; c++) {
      cards.push(card.id);
    }

    const existing = entryMap.get(card.id);
    if (existing) {
      existing.count += count;
    } else {
      const entry = { cardId: card.id, count };
      entryMap.set(card.id, entry);
      entries.push(entry);
    }
  }

  const entryTotal = entries.reduce((sum, e) => sum + e.count, 0);
  if (cards.length !== 30 || entryTotal !== 30) {
    throw new Error(
      `Deck "${deckName}" (#${deckIndex + 1}) has ${cards.length} cards (entries sum ${entryTotal}) instead of 30!`,
    );
  }

  const id = `deck-${String(deckIndex + 1).padStart(3, '0')}-${slugifyId(deckName)}`;
  const opponentId = `opp-${String(deckIndex + 1).padStart(3, '0')}-${slugifyId(duelistName)}`;
  const tier = classifyDifficultyTier(deckIndex, deckName, owner, entries, preserveExactOrder);
  const representativeCardId = chooseRepresentativeCardId(duelistName, armorCardId, entries);
  const disableArmorOnCardIds = disableArmorSet.size > 0 ? Array.from(disableArmorSet) : undefined;
  const description = buildFlavorQuote(duelistName, deckName, colors, tier, note);

  parsedDecks.push({
    id,
    opponentId,
    index: deckIndex,
    name: deckName,
    colors,
    owner,
    duelistName,
    ...(location ? { location } : {}),
    ...(note ? { note } : {}),
    ...(preserveExactOrder ? { preserveExactOrder: true } : {}),
    ...(typeof armorCardId === 'number' ? { armorCardId } : {}),
    ...(armorInfo ? { armorInfo } : {}),
    ...(disableArmorOnCardIds ? { disableArmorOnCardIds } : {}),
    tier,
    representativeCardId,
    description,
    entries,
    cards,
  });
}

const tierCounts = { Easy: 0, Normal: 0, Hard: 0, Expert: 0 };
for (const d of parsedDecks) {
  tierCounts[d.tier]++;
}

const outputTs = `// AUTO-GENERATED by scripts/import-decks.mjs — DO NOT EDIT MANUALLY
import type { CardId } from '../types/game';

export type DifficultyTier = 'Easy' | 'Normal' | 'Hard' | 'Expert';

export interface DeckCardEntry {
  cardId: CardId;
  count: number;
}

export interface GeneratedBaseDeck {
  id: string;
  opponentId: string;
  index: number;
  name: string;
  colors: string;
  owner: string;
  duelistName: string;
  location?: string;
  note?: string;
  preserveExactOrder?: boolean;
  armorCardId?: CardId;
  armorInfo?: string;
  disableArmorOnCardIds?: CardId[];
  tier: DifficultyTier;
  representativeCardId: CardId;
  description: string;
  entries: DeckCardEntry[];
  cards: CardId[];
}

export const GENERATED_DECKS: readonly GeneratedBaseDeck[] = ${JSON.stringify(parsedDecks, null, 2)};
`;

fs.writeFileSync(OUTPUT_PATH, outputTs, 'utf8');
console.log(`Successfully parsed ${parsedDecks.length} decks into src/data/decks.generated.ts`);
console.log('Tier breakdown:', tierCounts);
