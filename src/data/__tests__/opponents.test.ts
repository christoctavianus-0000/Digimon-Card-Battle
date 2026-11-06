import { describe, expect, it } from 'vitest';
import { DECK_SIZE } from '../../types/game';
import { ALL_CARDS, getCardById, getCardByName } from '../cards';
import {
  ALL_BASE_DECKS,
  OPPONENTS,
  STARTER_DECKS,
  getDeckById,
  getOpponentById,
  getOpponentsByTier,
  type DifficultyTier,
} from '../opponents';

const VALID_TIERS: readonly DifficultyTier[] = ['Easy', 'Normal', 'Hard', 'Expert'];

describe('Base Decks & Opponents Database', () => {
  it('parses all 138 base decks from docs/base-deck-list..txt (count >= 130)', () => {
    expect(ALL_BASE_DECKS.length).toBeGreaterThanOrEqual(130);
    expect(ALL_BASE_DECKS.length).toBe(138);
    expect(OPPONENTS.length).toBe(ALL_BASE_DECKS.length);
  });

  it('ensures every deck has exactly 30 valid card IDs (0..300) and matching entries sum', () => {
    const maxCardId = ALL_CARDS.length - 1;
    expect(maxCardId).toBe(300);

    for (const deck of ALL_BASE_DECKS) {
      expect(deck.cards.length, `Deck "${deck.name}" should have ${DECK_SIZE} cards`).toBe(DECK_SIZE);

      const entrySum = deck.entries.reduce((acc, e) => acc + e.count, 0);
      expect(entrySum, `Deck "${deck.name}" entries should sum to ${DECK_SIZE}`).toBe(DECK_SIZE);

      for (const cardId of deck.cards) {
        expect(Number.isInteger(cardId)).toBe(true);
        expect(cardId).toBeGreaterThanOrEqual(0);
        expect(cardId).toBeLessThanOrEqual(300);
        expect(getCardById(cardId), `Card ID ${cardId} in "${deck.name}" must exist`).toBeDefined();
      }

      for (const entry of deck.entries) {
        expect(entry.count).toBeGreaterThanOrEqual(1);
        expect(getCardById(entry.cardId)).toBeDefined();
      }
    }
  });

  it('ensures every opponent has a valid representativeCardId (0..300), valid tier, and AI difficulty', () => {
    const seenOpponentIds = new Set<string>();
    const seenDeckIds = new Set<string>();

    for (const opp of OPPONENTS) {
      expect(seenOpponentIds.has(opp.id), `Duplicate opponent ID ${opp.id}`).toBe(false);
      seenOpponentIds.add(opp.id);

      expect(seenDeckIds.has(opp.deckId), `Duplicate deck ID ${opp.deckId}`).toBe(false);
      seenDeckIds.add(opp.deckId);

      expect(opp.name.length).toBeGreaterThan(0);
      expect(opp.deckName.length).toBeGreaterThan(0);
      expect(opp.colors.length).toBeGreaterThan(0);
      expect(opp.description.length).toBeGreaterThan(0);
      expect(opp.quote).toBe(opp.description);

      expect(VALID_TIERS).toContain(opp.tier);
      expect(['easy', 'normal', 'hard']).toContain(opp.defaultAiDifficulty);

      expect(Number.isInteger(opp.representativeCardId)).toBe(true);
      expect(opp.representativeCardId).toBeGreaterThanOrEqual(0);
      expect(opp.representativeCardId).toBeLessThanOrEqual(300);
      const repCard = getCardById(opp.representativeCardId);
      expect(repCard, `Representative card for ${opp.name} must exist`).toBeDefined();
      expect(repCard?.kind).toBe('Digimon');
    }
  });

  it('populates non-empty opponent lists across all four difficulty tiers', () => {
    let totalAcrossTiers = 0;
    for (const tier of VALID_TIERS) {
      const list = getOpponentsByTier(tier);
      expect(list.length, `Tier ${tier} should have opponents`).toBeGreaterThan(0);
      totalAcrossTiers += list.length;
    }
    expect(totalAcrossTiers).toBe(OPPONENTS.length);
  });

  it('preserves disableArmorOnCardIds when [no armor] or --- no armor is specified', () => {
    const goGoDino = getDeckById('Go Go Dinosaur Deck');
    const veemonCard = getCardByName('Veemon');
    expect(goGoDino).toBeDefined();
    expect(veemonCard).toBeDefined();
    expect(goGoDino?.disableArmorOnCardIds).toContain(veemonCard!.id);

    const getSerious = getDeckById('Get Serious Deck');
    const wormmonCard = getCardByName('Wormmon');
    expect(getSerious).toBeDefined();
    expect(wormmonCard).toBeDefined();
    expect(getSerious?.disableArmorOnCardIds).toContain(wormmonCard!.id);

    const callOfDestiny = getDeckById('Call of Destiny Deck');
    const gatomonCard = getCardByName('Gatomon');
    expect(callOfDestiny).toBeDefined();
    expect(gatomonCard).toBeDefined();
    expect(callOfDestiny?.disableArmorOnCardIds).toContain(gatomonCard!.id);
  });

  it('resolves Armor evolution card IDs for Armor decks', () => {
    const evilFire = getDeckById('Evil Fire Deck');
    const shadramon = getCardByName('Shadramon');
    expect(evilFire).toBeDefined();
    expect(evilFire?.armorCardId).toBe(shadramon?.id);

    const wingsOfHope = getDeckById('Wings of Hope Deck');
    const pegasusmon = getCardByName('Pegasusmon');
    expect(wingsOfHope).toBeDefined();
    expect(wingsOfHope?.armorCardId).toBe(pegasusmon?.id);
  });

  it('preserves Analogman Darkness Wave Deck exact 30-card play order', () => {
    const darknessWave = getDeckById('Darkness Wave Deck');
    expect(darknessWave).toBeDefined();
    expect(darknessWave?.preserveExactOrder).toBe(true);
    expect(darknessWave?.duelistName).toBe('Analogman');
    expect(darknessWave?.tier).toBe('Expert');

    const downloadDigivolve = getCardByName('Download Digivolve');
    const demiDevimon = getCardByName('DemiDevimon');
    const apokarimon = getCardByName('Apokarimon');
    expect(darknessWave?.cards[0]).toBe(downloadDigivolve?.id);
    expect(darknessWave?.cards[1]).toBe(demiDevimon?.id);
    expect(darknessWave?.cards[2]).toBe(apokarimon?.id);
  });

  it('disambiguates Desert Island and Dark City decks for Devimon and Myotismon', () => {
    const coolDevil = getDeckById('Cool Devil Deck');
    const devilsCall = getDeckById("Devil's Call Deck");
    expect(coolDevil?.location).toBe('Desert Island');
    expect(coolDevil?.duelistName).toBe('Devimon (Desert Island)');
    expect(devilsCall?.location).toBe('Dark City');
    expect(devilsCall?.duelistName).toBe('Devimon (Dark City)');
  });

  it('provides curated STARTER_DECKS and supports getDeckById / getOpponentById lookups', () => {
    expect(STARTER_DECKS.length).toBeGreaterThanOrEqual(10);
    for (const starter of STARTER_DECKS) {
      expect(getDeckById(starter.id)).toBe(starter);
      expect(getDeckById(starter.name)).toBe(starter);
      expect(getOpponentById(starter.opponentId)).toBeDefined();
    }
  });
});
