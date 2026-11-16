import { beforeEach, describe, expect, it } from 'vitest';
import { getCardByName } from '../../data/cards';
import { ALL_BASE_DECKS } from '../../data/opponents';
import {
  analyzeDeck,
  autoCompleteDeck,
  canAddCardToDeck,
  createDeck,
  createDefaultDecks,
  deleteDeck,
  duplicateDeck,
  exportDeckCode,
  exportDeckJson,
  generateRandomDeck,
  getActiveDeck,
  getMaxCopiesForCard,
  importDeckCode,
  loadBaseDeckIntoSlot,
  loadDeckStore,
  recordMatchResult,
  renameDeck,
  resetDeckStore,
  saveDeckStore,
  selectActiveDeck,
  validateDeck,
} from '../deckStore';

function setupMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: mockStorage },
    writable: true,
    configurable: true,
  });
}

describe('deckStore — Deck Validation, Persistence & Import/Export', () => {
  beforeEach(() => {
    setupMockLocalStorage();
  });

  it('initializes default starter decks from canonical 30-card base decks', () => {
    const decks = createDefaultDecks();
    expect(decks.length).toBeGreaterThanOrEqual(5);

    for (const deck of decks) {
      expect(deck.cards).toHaveLength(30);
      const v = validateDeck(deck.cards);
      expect(v.valid).toBe(true);
      expect(v.isComplete).toBe(true);
      expect(v.errors).toHaveLength(0);
    }
  });

  it('enforces 30-card size, max 4 normal copies, max 1 Partner (R P) copy, max 3 total Partners, and Rookie requirement', () => {
    const agumon = getCardByName('Agumon')!; // R
    const greymon = getCardByName('Greymon')!; // C
    const veemon = getCardByName('Veemon')!; // R P (175)
    const hawkmon = getCardByName('Hawkmon')!; // R P (182)
    const patamon = getCardByName('Patamon')!; // R P (183)
    const gatomon = getCardByName('Gatomon')!; // R P (184)
    const flamedramon = getCardByName('Flamedramon')!; // A (172)

    expect(getMaxCopiesForCard(agumon)).toBe(4);
    expect(getMaxCopiesForCard(flamedramon)).toBe(0);
    expect(canAddCardToDeck([], flamedramon.id).allowed).toBe(false);
    expect(getMaxCopiesForCard(veemon)).toBe(1);

    // Incomplete deck (< 30 cards)
    const shortDeck = [agumon.id, agumon.id, agumon.id, agumon.id];
    const shortRes = validateDeck(shortDeck);
    expect(shortRes.valid).toBe(false);
    expect(shortRes.isComplete).toBe(false);

    // 5 copies of Agumon should be blocked by canAddCardToDeck and flagged by validateDeck
    const canAdd5th = canAddCardToDeck(shortDeck, agumon.id);
    expect(canAdd5th.allowed).toBe(false);
    expect(canAdd5th.reason).toMatch(/Max 4 copies/i);

    // Partner R P card max 1 copy
    const withVeemon = [veemon.id];
    const canAdd2ndVeemon = canAddCardToDeck(withVeemon, veemon.id);
    expect(canAdd2ndVeemon.allowed).toBe(false);
    expect(canAdd2ndVeemon.reason).toMatch(/Partner/i);

    // Max 3 total Partner R P cards per deck
    const threePartners = [veemon.id, hawkmon.id, patamon.id];
    const canAdd4thPartner = canAddCardToDeck(threePartners, gatomon.id);
    expect(canAdd4thPartner.allowed).toBe(false);
    expect(canAdd4thPartner.reason).toMatch(/Max 3 Partner/i);

    // Missing Rookie requirement check
    const noRookieDeck: number[] = [];
    const championIds = [10, 11, 12, 13, 14, 15, 16, 17];
    for (const cid of championIds) {
      for (let i = 0; i < 4 && noRookieDeck.length < 30; i++) {
        noRookieDeck.push(cid);
      }
    }
    expect(noRookieDeck).toHaveLength(30);
    const noRookieVal = validateDeck(noRookieDeck);
    expect(noRookieVal.valid).toBe(false);
    expect(noRookieVal.rookieCount).toBe(0);
    expect(noRookieVal.errors.some((e) => /Rookie/i.test(e))).toBe(true);

    // Over-copy & over-partner validation errors
    const invalidPartnerDeck = [
      veemon.id,
      veemon.id,
      hawkmon.id,
      patamon.id,
      gatomon.id,
      ...Array(25).fill(greymon.id),
    ];
    const invalidRes = validateDeck(invalidPartnerDeck);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('auto-completes partial or empty decks into valid 30-card decks', () => {
    const randomFire = generateRandomDeck({ specialty: 'Fire', seed: 12345 });
    expect(randomFire).toHaveLength(30);
    const val = validateDeck(randomFire);
    expect(val.valid).toBe(true);
    expect(val.rookieCount).toBeGreaterThanOrEqual(6);

    const partial = [175, 172]; // Veemon + Flamedramon (Armor should be excluded)
    const completed = autoCompleteDeck(partial, { seed: 42 });
    expect(completed).toHaveLength(30);
    expect(validateDeck(completed).valid).toBe(true);
    expect(completed).toContain(175);
    expect(completed).not.toContain(172);
  });

  it('computes deck specialty breakdown, level curve, and +P averages', () => {
    const starter = createDefaultDecks()[0];
    const analysis = analyzeDeck(starter.cards);
    expect(analysis.totalCards).toBe(30);
    expect(analysis.digimonCount + analysis.optionCount).toBe(30);
    expect(analysis.avgPlusPDigimon).toBeGreaterThan(0);
  });

  it('exports and imports DDCB1 compact deck codes, JSON, and plain-text lists', () => {
    const starter = createDefaultDecks()[0];

    // 1. DDCB1 Compact Code round-trip
    const code = exportDeckCode(starter);
    expect(code.startsWith('DDCB1:')).toBe(true);
    const parsedFromCode = importDeckCode(code);
    expect(parsedFromCode.name).toBe(starter.name);
    expect(parsedFromCode.cards).toHaveLength(30);
    expect([...parsedFromCode.cards].sort((a, b) => a - b)).toEqual(
      [...starter.cards].sort((a, b) => a - b)
    );

    // 2. JSON round-trip
    const json = exportDeckJson(starter);
    const parsedFromJson = importDeckCode(json);
    expect(parsedFromJson.name).toBe(starter.name);
    expect(parsedFromJson.cards).toEqual(starter.cards);

    // 3. Plain-text card list
    const plainText = [
      'Deck: My Red Blitz',
      '4 Agumon',
      '4x #012 Greymon',
      '#002 WarGreymon x2',
      '1 Veemon',
    ].join('\n');
    const parsedPlain = importDeckCode(plainText);
    expect(parsedPlain.name).toBe('My Red Blitz');
    expect(parsedPlain.cards).toHaveLength(11);
  });

  it('persists deck CRUD operations, base deck loading, and opponent battle records in localStorage', () => {
    let state = resetDeckStore('test_ddcb_store');
    expect(state.decks.length).toBeGreaterThanOrEqual(5);

    // Create a new deck
    const sampleCards = generateRandomDeck({ specialty: 'Ice', seed: 99 });
    state = createDeck(state, 'Glacier Control', sampleCards);
    expect(getActiveDeck(state).name).toBe('Glacier Control');

    // Rename deck
    const createdId = state.activeDeckId;
    state = renameDeck(state, createdId, 'Absolute Zero');
    expect(getActiveDeck(state).name).toBe('Absolute Zero');

    // Duplicate deck
    state = duplicateDeck(state, createdId, 'Absolute Zero v2');
    expect(getActiveDeck(state).name).toBe('Absolute Zero v2');

    // Switch active deck
    state = selectActiveDeck(state, createdId);
    expect(state.activeDeckId).toBe(createdId);

    // Load a canonical base deck from ALL_BASE_DECKS
    const targetBase = ALL_BASE_DECKS[10];
    state = loadBaseDeckIntoSlot(state, createdId, targetBase);
    expect(getActiveDeck(state).name).toBe(targetBase.name);
    expect(getActiveDeck(state).cards).toEqual(targetBase.cards);

    // Record match outcomes
    state = recordMatchResult(state, targetBase.opponentId, 'win');
    state = recordMatchResult(state, targetBase.opponentId, 'win');
    state = recordMatchResult(state, targetBase.opponentId, 'loss');

    expect(state.stats.totalWins).toBe(2);
    expect(state.stats.totalLosses).toBe(1);
    const oppRec = state.stats.byOpponent[targetBase.opponentId];
    expect(oppRec.wins).toBe(2);
    expect(oppRec.losses).toBe(1);
    expect(oppRec.currentStreak).toBe(0);
    expect(oppRec.bestStreak).toBe(2);

    // Save & reload from custom storage key
    saveDeckStore(state, 'test_ddcb_store');
    const reloaded = loadDeckStore('test_ddcb_store');
    expect(reloaded.activeDeckId).toBe(createdId);
    expect(reloaded.stats.totalWins).toBe(2);

    // Delete deck
    const beforeCount = reloaded.decks.length;
    const afterDelete = deleteDeck(reloaded, createdId);
    expect(afterDelete.decks).toHaveLength(beforeCount - 1);
    expect(afterDelete.activeDeckId).not.toBe(createdId);
  });
});
