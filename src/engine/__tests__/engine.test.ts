import { describe, expect, it } from 'vitest';
import { getCardById } from '../../data/cards';
import { ALL_DIGI_PARTS, getEffectiveCardData } from '../../data/digiParts';
import {
  createDefaultDeckStoreState,
  equipDigiPartToPartner,
  updatePartnerConfig,
} from '../../state/deckStore';
import type { Action, CardId, MatchState } from '../../types/game';
import {
  ARMOR_LINEAGE,
  applyAction,
  applyNumericMode,
  createEffectExecContext,
  createMatch,
  executeEffectOps,
  getActiveDigimonSlotPowers,
  getLegalActions,
  getVisibleState,
  resolveBattle,
  validateDeck,
} from '../index';

/**
 * Helper: Builds a valid 30-card Fire/Partner test deck.
 */
function buildTestDeck(): CardId[] {
  return [
    27, 27, 27, 27, // 4x #027 Agumon (R, Fire)
    29, 29, 29, 29, // 4x #029 Biyomon (R, Fire)
    175, // 1x #175 Veemon (R P, Fire)
    30, 30, // 2x #030 DemiMeramon (R, Fire)
    14, 14, 14, 14, // 4x #014 Greymon (C, Fire)
    9, 9, 9, 9, // 4x #009 MetalGreymon (U, Fire)
    2, 2, 2, 2, // 4x #002 WarGreymon (U, Fire)
    264, 264, 264, 264, // 4x #264 Attack Chip (Option, +300 Atk)
    266, 266, 266, // 3x #266 Recovery Floppy (Option, +300 HP)
  ];
}

/**
 * Helper: Sets up a match ready at the start of Battle Phase (`attackSelect`) or `digivolve` phase
 * with controlled active Digimon and hands.
 */
function createBattleReadyState(options?: {
  playerCardId?: CardId;
  opponentCardId?: CardId;
  playerHp?: number;
  opponentHp?: number;
  playerHand?: CardId[];
  opponentHand?: CardId[];
  activePlayer?: 'player' | 'opponent';
}): MatchState {
  const state = createMatch({
    playerDeck: buildTestDeck(),
    opponentDeck: buildTestDeck(),
    seed: 12345,
    firstPlayer: options?.activePlayer ?? 'player',
    config: { enableMulligan: false },
  });

  const pCard = getCardById(options?.playerCardId ?? 27)!;
  const oCard = getCardById(options?.opponentCardId ?? 62)!; // #062 Gabumon (R, Ice)

  state.players.player.battleDigimon = {
    cardId: pCard.id,
    stack: [],
    currentHp: options?.playerHp ?? pCard.hp,
    maxHp: pCard.hp,
    effectiveSpecialty: pCard.specialty ?? 'Fire',
  };
  state.players.opponent.battleDigimon = {
    cardId: oCard.id,
    stack: [],
    currentHp: options?.opponentHp ?? oCard.hp,
    maxHp: oCard.hp,
    effectiveSpecialty: oCard.specialty ?? 'Ice',
  };

  if (options?.playerHand) {
    state.players.player.hand = [...options.playerHand];
  }
  if (options?.opponentHand) {
    state.players.opponent.hand = [...options.opponentHand];
  }

  const turnStarter = options?.activePlayer ?? 'player';
  const defender = turnStarter === 'player' ? 'opponent' : 'player';
  state.activePlayer = turnStarter;
  state.phase = 'attackSelect';
  state.battle = {
    firstAttacker: turnStarter,
    defender,
    chosenAttacks: { player: null, opponent: null },
    effectiveAttacks: { player: null, opponent: null },
    supportCards: { player: null, opponent: null },
    supportDecided: { player: false, opponent: false },
    computedPowers: { player: 0, opponent: 0 },
    grantedAbilities: { player: [], opponent: [] },
    abilityRemoved: { player: false, opponent: false },
    reviveOnKo: { player: null, opponent: null },
  };

  return state;
}

describe('Core Battle Engine (DDCB PS1)', () => {
  // -------------------------------------------------------------------------
  // 1. Deck Validation
  // -------------------------------------------------------------------------
  describe('Deck Validation', () => {
    it('1. accepts a valid 30-card deck respecting copy and partner limits, and rejects Armor (A) cards', () => {
      const deck = buildTestDeck();
      const res = validateDeck(deck);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);

      const deckWithArmor = [...deck];
      deckWithArmor[0] = 172; // #172 Flamedramon (Level A) cannot be placed in decks
      const armorRes = validateDeck(deckWithArmor);
      expect(armorRes.valid).toBe(false);
      expect(armorRes.errors.some((e) => e.includes('Flamedramon') || e.includes('Armor'))).toBe(
        true
      );
    });

    it('2. rejects a deck with fewer or more than 30 cards', () => {
      const shortDeck = buildTestDeck().slice(0, 29);
      const res = validateDeck(shortDeck);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('30'))).toBe(true);
    });

    it('3. rejects a deck with more than 4 copies of a standard card', () => {
      const deck = buildTestDeck();
      deck[4] = 27; // 5th copy of Agumon (#027)
      const res = validateDeck(deck);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('Agumon'))).toBe(true);
    });

    it('4. rejects a deck with >1 copy of the same Partner Rookie or >3 total Partner Rookies', () => {
      const deck1 = buildTestDeck();
      deck1[0] = 175; // 2nd copy of Veemon (#175, Level 'R P')
      expect(validateDeck(deck1).valid).toBe(false);

      const deck2 = buildTestDeck();
      deck2[0] = 182; // Hawkmon (R P)
      deck2[1] = 183; // Patamon (R P)
      deck2[2] = 184; // Gatomon (R P) -> + Veemon = 4 Partner Rookies
      const res2 = validateDeck(deck2);
      expect(res2.valid).toBe(false);
      expect(res2.errors.some((e) => e.includes('Partner Rookie'))).toBe(true);
    });

    it('5. rejects a deck with zero Rookie cards', () => {
      const noRookieDeck = Array.from({ length: 30 }, (_, i) => 14 + Math.floor(i / 4)); // C/U cards only
      const res = validateDeck(noRookieDeck);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('Rookie'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Setup, Determinism, Mulligan & Rookie Placement
  // -------------------------------------------------------------------------
  describe('Setup, Determinism, Mulligan & Rookie Placement', () => {
    it('6. produces 100% identical states when given the same seed', () => {
      const deck = buildTestDeck();
      const s1 = createMatch({ playerDeck: deck, opponentDeck: deck, seed: 99999 });
      const s2 = createMatch({ playerDeck: deck, opponentDeck: deck, seed: 99999 });
      expect(s1.players.player.hand).toEqual(s2.players.player.hand);
      expect(s1.players.opponent.hand).toEqual(s2.players.opponent.hand);
      expect(s1.players.player.online).toEqual(s2.players.player.online);
      expect(s1.activePlayer).toEqual(s2.activePlayer);
      expect(s1.rngSeed).toEqual(s2.rngSeed);
    });

    it('7. starts in mulligan phase with 4 cards in hand and 26 in online deck, and guarantees >= 1 Rookie', () => {
      const state = createMatch({
        playerDeck: buildTestDeck(),
        opponentDeck: buildTestDeck(),
        seed: 42,
        firstPlayer: 'player',
      });
      expect(state.phase).toBe('mulligan');
      expect(state.players.player.hand).toHaveLength(4);
      expect(state.players.player.online).toHaveLength(26);
      expect(
        state.players.player.hand.some((id) => {
          const l = getCardById(id)?.level;
          return l === 'R' || l === 'R P';
        }),
      ).toBe(true);
    });

    it('8. handles mulligan keep and redraw transitions into rookiePlacement', () => {
      let state = createMatch({
        playerDeck: buildTestDeck(),
        opponentDeck: buildTestDeck(),
        seed: 777,
        firstPlayer: 'player',
      });

      const actionsP1 = getLegalActions(state, 'player');
      expect(actionsP1).toEqual([
        { type: 'mulligan', side: 'player', keep: true },
        { type: 'mulligan', side: 'player', keep: false },
      ]);

      // Player redraws (keep: false), Opponent keeps (keep: true)
      state = applyAction(state, { type: 'mulligan', side: 'player', keep: false });
      expect(state.mulliganDecided?.player).toBe(true);
      expect(state.phase).toBe('mulligan');
      expect(state.activePlayer).toBe('opponent');

      state = applyAction(state, { type: 'mulligan', side: 'opponent', keep: true });
      expect(state.phase).toBe('rookiePlacement');
      expect(state.activePlayer).toBe('player');
    });

    it('9. places initial Rookies for both players and auto-draws back up to 4 cards on Turn 1', () => {
      let state = createMatch({
        playerDeck: buildTestDeck(),
        opponentDeck: buildTestDeck(),
        seed: 101,
        firstPlayer: 'player',
        config: { enableMulligan: false },
      });

      expect(state.phase).toBe('rookiePlacement');

      const p1Rookies = getLegalActions(state, 'player');
      expect(p1Rookies.length).toBeGreaterThan(0);
      expect(p1Rookies[0]!.type).toBe('placeRookie');

      state = applyAction(state, p1Rookies[0]!);
      expect(state.players.player.battleDigimon).not.toBeNull();
      expect(state.players.player.hand).toHaveLength(3);
      expect(state.phase).toBe('rookiePlacement');
      expect(state.activePlayer).toBe('opponent');

      const p2Rookies = getLegalActions(state, 'opponent');
      state = applyAction(state, p2Rookies[0]!);

      // Now Turn 1 starts for 'player': auto-draws 1 card (back to 4 in hand) and enters 'digivolve'
      expect(state.phase).toBe('digivolve');
      expect(state.activePlayer).toBe('player');
      expect(state.players.player.hand).toHaveLength(4);
      expect(state.players.player.online).toHaveLength(25);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Preparation Phase: DP Slot, Normal Digivolve, Armor Digivolve & Options
  // -------------------------------------------------------------------------
  describe('Preparation & Digivolve Phase', () => {
    function setupDigivolvePhase(): MatchState {
      const state = createBattleReadyState({
        playerCardId: 27, // Agumon (R, Fire)
        opponentCardId: 62, // Gabumon (R, Ice)
        playerHand: [27, 14, 9, 264],
      });
      state.phase = 'digivolve';
      state.activePlayer = 'player';
      return state;
    }

    it('10. enforces adding at most 1 Digimon card to DP Slot per turn and blocks Option/Armor cards', () => {
      let state = setupDigivolvePhase();
      state.players.player.hand = [27, 29, 172, 264]; // Agumon (+20), Biyomon (+20), Flamedramon (A), Attack Chip (Option)

      const legal = getLegalActions(state, 'player').filter((a) => a.type === 'addToDp');
      // Only indices 0 (Agumon) and 1 (Biyomon) can be added to DP Slot
      expect(legal.map((a) => (a as { handIndex: number }).handIndex)).toEqual([0, 1]);

      state = applyAction(state, { type: 'addToDp', side: 'player', handIndex: 0 });
      expect(state.players.player.dpSlot).toEqual([27]);
      expect(state.players.player.dpTotal).toBe(getCardById(27)!.plusP);

      // Cannot add a second DP card in the same turn
      const legalAfter = getLegalActions(state, 'player').filter((a) => a.type === 'addToDp');
      expect(legalAfter).toHaveLength(0);
    });

    it('11. performs normal Digivolution R -> C -> U, resets HP to printed maxHp, and consumes entire DP Slot', () => {
      let state = setupDigivolvePhase();
      const greymon = getCardById(14)!;
      const metalGreymon = getCardById(9)!;

      // Give player enough DP for Greymon (40 DP: two #027 Agumon cards = 40 DP)
      state.players.player.dpSlot = [27, 27];
      state.players.player.dpTotal = 40;
      state.players.player.battleDigimon!.currentHp = 120; // Damaged Agumon
      state.players.player.hand = [14, 9];

      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });
      expect(state.players.player.battleDigimon!.cardId).toBe(14);
      expect(state.players.player.battleDigimon!.stack).toEqual([27]);
      expect(state.players.player.battleDigimon!.currentHp).toBe(greymon.hp);
      // Entire DP slot consumed to offline
      expect(state.players.player.dpSlot).toEqual([]);
      expect(state.players.player.dpTotal).toBe(0);
      expect(state.players.player.offline).toContain(27);

      // Now give enough DP and digivolve C -> U (#009 MetalGreymon)
      state.players.player.dpSlot = [27, 29];
      state.players.player.dpTotal = metalGreymon.dp;
      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });
      expect(state.players.player.battleDigimon!.cardId).toBe(9);
      expect(state.players.player.battleDigimon!.stack).toEqual([27, 14]);
      expect(state.players.player.battleDigimon!.currentHp).toBe(metalGreymon.hp);
      expect(state.players.player.dpSlot).toEqual([]);
    });

    it('12. Partner R P offers Armor Evolution (Veemon 3, others 2) or Normal Rookie (C -> U) on placement and preserves DP Slot', () => {
      // Canonical Armor evolution counts: Veemon has 3, all other Partners have 2
      expect(ARMOR_LINEAGE[175]).toEqual([172, 173, 185]);
      for (const partnerId of [182, 183, 184, 187, 190]) {
        expect(ARMOR_LINEAGE[partnerId]).toHaveLength(2);
      }

      const base = setupDigivolvePhase();
      const flamedramon = getCardById(172)!;
      const greymon = getCardById(14)!;

      // Branch A: Deploy Veemon (#175) as Armor (#172 Flamedramon) during rookiePlacement
      const stateA = structuredClone(base);
      stateA.phase = 'rookiePlacement';
      stateA.activePlayer = 'player';
      stateA.players.player.battleDigimon = null;
      stateA.players.player.dpSlot = [27];
      stateA.players.player.dpTotal = 20;
      stateA.players.player.hand = [175, 14]; // #175 Veemon (R P), #014 Greymon (C)

      const veemonActions = getLegalActions(stateA, 'player').filter(
        (a): a is Extract<Action, { type: 'placeRookie' }> =>
          a.type === 'placeRookie' && a.handIndex === 0
      );
      // 1 normal Rookie deployment + 3 Veemon Armor choices
      expect(veemonActions).toHaveLength(4);
      expect(veemonActions.filter((a) => a.armorCardId === undefined)).toHaveLength(1);
      expect(
        veemonActions
          .filter((a) => a.armorCardId !== undefined)
          .map((a) => a.armorCardId)
      ).toEqual([172, 173, 185]);

      const afterArmorPlace = applyAction(stateA, {
        type: 'placeRookie',
        side: 'player',
        handIndex: 0,
        armorCardId: 172,
      });
      expect(afterArmorPlace.players.player.battleDigimon!.cardId).toBe(172);
      expect(afterArmorPlace.players.player.battleDigimon!.stack).toEqual([175]);
      expect(afterArmorPlace.players.player.battleDigimon!.currentHp).toBe(flamedramon.hp);
      expect(afterArmorPlace.players.player.dpSlot).toEqual([27]);
      expect(afterArmorPlace.players.player.dpTotal).toBe(20);

      // Branch B: Deploy Veemon (#175) as a Normal Rookie and digivolve normally into #014 Greymon (C)
      const stateB = structuredClone(base);
      stateB.phase = 'rookiePlacement';
      stateB.activePlayer = 'player';
      stateB.players.player.battleDigimon = null;
      stateB.players.player.dpSlot = [27];
      stateB.players.player.dpTotal = greymon.dp;
      stateB.players.player.hand = [175, 14];

      let afterNormalPlace = applyAction(stateB, {
        type: 'placeRookie',
        side: 'player',
        handIndex: 0,
      });
      expect(afterNormalPlace.players.player.battleDigimon!.cardId).toBe(175);
      expect(afterNormalPlace.players.player.battleDigimon!.stack).toEqual([]);

      afterNormalPlace.phase = 'digivolve';
      afterNormalPlace.activePlayer = 'player';
      const digiActions = getLegalActions(afterNormalPlace, 'player');
      expect(digiActions.some((a) => a.type === 'armorDigivolve')).toBe(false);
      expect(digiActions.some((a) => a.type === 'digivolve' && a.handIndex === 0)).toBe(true);

      afterNormalPlace = applyAction(afterNormalPlace, {
        type: 'digivolve',
        side: 'player',
        handIndex: 0,
      });
      expect(afterNormalPlace.players.player.battleDigimon!.cardId).toBe(14);
      expect(afterNormalPlace.players.player.battleDigimon!.stack).toEqual([175]);
    });

    it('13. executes #299 Speed Digivolve (ignores DP requirement and keeps DP Slot intact)', () => {
      let state = setupDigivolvePhase();
      state.players.player.dpSlot = [14]; // Only 10 DP
      state.players.player.dpTotal = 10;
      state.players.player.hand = [299, 14]; // #299 Speed Digivolve, #014 Greymon

      // Before Speed Digivolve, cannot digivolve into Greymon
      expect(getLegalActions(state, 'player').some((a) => a.type === 'digivolve')).toBe(false);

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      expect(state.players.player.activeDigivolveModifier?.ignoreDp).toBe(true);

      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });
      expect(state.players.player.battleDigimon!.cardId).toBe(14);
      // DP Slot NOT discarded when ignoreDp is active!
      expect(state.players.player.dpSlot).toEqual([14]);
      expect(state.players.player.dpTotal).toBe(10);
    });

    it('14. executes #297 Warp Digivolve (R -> U directly, consuming U DP)', () => {
      let state = setupDigivolvePhase();
      const metalGreymon = getCardById(9)!;
      state.players.player.dpSlot = [27, 29];
      state.players.player.dpTotal = metalGreymon.dp;
      state.players.player.hand = [297, 9]; // #297 Warp Digivolve, #009 MetalGreymon (U, Fire)

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });

      expect(state.players.player.battleDigimon!.cardId).toBe(9);
      expect(state.players.player.battleDigimon!.stack).toEqual([27]);
      expect(state.players.player.dpSlot).toEqual([]);
    });

    it('15. executes #295 Special Digivolve (ignores Specialty and grants +20 virtual DP)', () => {
      let state = setupDigivolvePhase();
      const garurumon = getCardById(46)!;
      state.players.player.dpSlot = [14];
      state.players.player.dpTotal = garurumon.dp - 20; // +20 virtual DP from Special Digivolve satisfies cost!
      // #046 Garurumon (C, Ice) onto #027 Agumon (R, Fire)
      state.players.player.hand = [295, 46];

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });

      expect(state.players.player.battleDigimon!.cardId).toBe(46);
      expect(state.players.player.battleDigimon!.effectiveSpecialty).toBe('Ice');
      expect(state.players.player.dpSlot).toEqual([]);
    });

    it('16. executes #296 Mutant Digivolve (same level R->R or C->C, ignoring Specialty, consuming DP)', () => {
      let state = setupDigivolvePhase();
      const garurumon = getCardById(46)!;
      // Active #014 Greymon (C, Fire) -> digivolve into #046 Garurumon (C, Ice)
      state.players.player.battleDigimon = {
        cardId: 14,
        stack: [27],
        currentHp: 860,
        maxHp: 860,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.dpSlot = [27, 29];
      state.players.player.dpTotal = garurumon.dp;
      state.players.player.hand = [296, 46];

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });

      expect(state.players.player.battleDigimon!.cardId).toBe(46);
      expect(state.players.player.dpSlot).toEqual([]);
    });

    it('17. executes #293 Download Digivolve (ignores Specialty, Level, and DP)', () => {
      let state = setupDigivolvePhase();
      state.players.player.dpSlot = [];
      state.players.player.dpTotal = 0;
      // Active #027 Agumon (R, Fire) -> #034 Vikemon (U, Ice) with 0 DP
      state.players.player.hand = [293, 34];

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });

      expect(state.players.player.battleDigimon!.cardId).toBe(34);
      expect(state.players.player.battleDigimon!.currentHp).toBe(getCardById(34)!.hp);
    });

    it('18. executes #294 ArmorCrush Digivolve (Level A -> Level C or U of matching Specialty with DP)', () => {
      let state = setupDigivolvePhase();
      const metalGreymon = getCardById(9)!;
      state.players.player.battleDigimon = {
        cardId: 172, // Flamedramon (A, Fire)
        stack: [175],
        currentHp: 600,
        maxHp: 600,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.dpSlot = [27, 29];
      state.players.player.dpTotal = metalGreymon.dp;
      state.players.player.hand = [294, 9]; // #294 ArmorCrush, #009 MetalGreymon (U, Fire)

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      state = applyAction(state, { type: 'digivolve', side: 'player', handIndex: 0 });

      expect(state.players.player.battleDigimon!.cardId).toBe(9);
      expect(state.players.player.battleDigimon!.stack).toEqual([175, 172]);
      expect(state.players.player.dpSlot).toEqual([]);
    });

    it('19. executes #298 De-Armor Digivolve and #300 Digi-devolve (doubles underlying Digimon HP)', () => {
      // Test #298 De-Armor Digivolve: Flamedramon (A) -> Veemon (R P)
      let state = setupDigivolvePhase();
      const veemon = getCardById(175)!;
      const agumon = getCardById(27)!;

      state.players.player.battleDigimon = {
        cardId: 172,
        stack: [175],
        currentHp: 300,
        maxHp: 600,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.hand = [298];

      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      expect(state.players.player.battleDigimon!.cardId).toBe(175);
      expect(state.players.player.battleDigimon!.currentHp).toBe(veemon.hp);
      expect(state.players.player.offline).not.toContain(172);
      expect(state.players.player.offline).toContain(298);

      // Test #300 Digi-devolve on an active Armor Digimon (#172 A): does not devolve Armor; Option is simply discarded
      state.players.player.battleDigimon = {
        cardId: 172,
        stack: [175],
        currentHp: 300,
        maxHp: getCardById(172)!.hp,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.hand = [300];
      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      expect(state.players.player.battleDigimon!.cardId).toBe(172);
      expect(state.players.player.offline).toContain(300);

      // Test #300 Digi-devolve: Greymon (C) -> Agumon (R, base HP doubled!)
      state.players.player.battleDigimon = {
        cardId: 14,
        stack: [27],
        currentHp: 400,
        maxHp: getCardById(14)!.hp,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.hand = [300];
      state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
      expect(state.players.player.battleDigimon!.cardId).toBe(27);
      expect(state.players.player.battleDigimon!.currentHp).toBe(agumon.hp * 2);
    });

    it('20. transitions both players through preparation before entering attackSelect', () => {
      let state = setupDigivolvePhase();
      // Player 1 ends digivolve phase -> Opponent draws to 4 cards and enters digivolve phase
      state = applyAction(state, { type: 'endDigivolvePhase', side: 'player' });
      expect(state.phase).toBe('digivolve');
      expect(state.activePlayer).toBe('opponent');

      // Opponent ends digivolve phase -> shared Battle Phase ('attackSelect') with 'player' as firstAttacker
      state = applyAction(state, { type: 'endDigivolvePhase', side: 'opponent' });
      expect(state.phase).toBe('attackSelect');
      expect(state.activePlayer).toBe('player');
      expect(state.battle?.firstAttacker).toBe('player');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Printed X-Attack Abilities & Combat Mechanics
  // -------------------------------------------------------------------------
  describe('X-Attack Abilities & Combat Mechanics', () => {
    it('21. executes [[circle]] to 0 (reduces opponent circle attack power to 0 even after support boost)', () => {
      const agumon = getCardById(27)!; // X-attack has `[[circle]] to 0`
      const gabumon = getCardById(62)!;

      let state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
        opponentHand: [264], // #264 Attack Chip (+300 Atk)
      });

      state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'x' });
      state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'circle' });
      state = applyAction(state, { type: 'passSupport', side: 'player' });
      state = applyAction(state, {
        type: 'playSupportFromHand',
        side: 'opponent',
        handIndex: 0,
      });

      // Agumon's X hits Gabumon; Gabumon's circle (+300 boost) was set to 0 by [[circle]] to 0!
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(
        gabumon.hp - agumon.attacks!.x.power,
      );
      expect(state.players.player.battleDigimon!.currentHp).toBe(agumon.hp);
    });

    it('22. executes [[circle]] Counter when Second Attacker survives matching attack ((firstAtk * 2) + ownAtk)', () => {
      // #006 RealMetalGreymon (X: 0 power, [[circle]] Counter) as defender (opponent)
      // #009 MetalGreymon as firstAttacker (player)
      const metalGreymon = getCardById(9)!;
      const realMetalGreymon = getCardById(6)!;

      const state = createBattleReadyState({
        playerCardId: 9,
        opponentCardId: 6,
        opponentHand: [6], // #006 RealMetalGreymon support: Boost own Attack Power +300
        activePlayer: 'player',
      });

      state.battle!.chosenAttacks = { player: 'circle', opponent: 'x' };
      state.battle!.supportCards = {
        player: null,
        opponent: { cardId: 6, source: 'hand' },
      };

      resolveBattle(state);

      const firstDmg = metalGreymon.attacks!.circle.power;
      const expectedOpponentHp = realMetalGreymon.hp - firstDmg;
      const counterDmg = firstDmg * 2 + 300;
      const expectedPlayerHp = Math.max(0, metalGreymon.hp - counterDmg);

      expect(state.players.opponent.battleDigimon!.currentHp).toBe(expectedOpponentHp);
      if (expectedPlayerHp === 0) {
        expect(state.players.player.battleDigimon).toBeNull();
        expect(state.players.opponent.koCount).toBe(1);
      } else {
        expect(state.players.player.battleDigimon!.currentHp).toBe(expectedPlayerHp);
      }
    });

    it('23. does NOT trigger Counter if Counter user attacks first or is KO’d by First Attacker', () => {
      const metalGreymon = getCardById(9)!;
      const realMetalGreymon = getCardById(6)!;

      // Case 1: Counter user is Turn Player (attacks first) -> deals 0 damage, no counter after defender hits
      const state1 = createBattleReadyState({
        playerCardId: 6, // RealMetalGreymon ([[circle]] Counter, X power 0)
        opponentCardId: 9, // MetalGreymon
        activePlayer: 'player',
      });
      state1.battle!.chosenAttacks = { player: 'x', opponent: 'circle' };
      resolveBattle(state1);
      expect(state1.players.opponent.battleDigimon!.currentHp).toBe(metalGreymon.hp); // Took 0 damage
      expect(state1.players.player.battleDigimon!.currentHp).toBe(
        realMetalGreymon.hp - metalGreymon.attacks!.circle.power,
      );

      // Case 2: Counter user is Second Attacker, but is KO'd by First Attacker's hit -> does not counter
      const state2 = createBattleReadyState({
        playerCardId: 9,
        opponentCardId: 6,
        opponentHp: 100, // Will be KO'd by MetalGreymon's circle
        activePlayer: 'player',
      });
      state2.battle!.chosenAttacks = { player: 'circle', opponent: 'x' };
      resolveBattle(state2);
      expect(state2.players.opponent.battleDigimon).toBeNull();
      expect(state2.players.player.battleDigimon!.currentHp).toBe(metalGreymon.hp); // Unharmed!
    });

    it('24. executes 1st Attack so Non-Turn Player strikes first and KOs Turn Player before Turn Player can hit', () => {
      const biyomon = getCardById(29)!; // X: 1st Attack
      const state = createBattleReadyState({
        playerCardId: 27,
        playerHp: 100, // Less than Biyomon's X attack power
        opponentCardId: 29,
        activePlayer: 'player',
      });
      state.battle!.chosenAttacks = { player: 'circle', opponent: 'x' };
      resolveBattle(state);

      expect(state.battle!.firstAttacker).toBe('opponent');
      expect(state.players.player.battleDigimon).toBeNull(); // KO'd before attacking
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(biyomon.hp); // Took 0 damage
    });

    it('25. executes Eat-Up HP (heals attacker by damage dealt, can exceed printed maxHp)', () => {
      const palmon = getCardById(98)!; // X: Eat-Up HP
      const agumon = getCardById(27)!;
      const state = createBattleReadyState({
        playerCardId: 98,
        playerHp: 400,
        opponentCardId: 27,
      });
      state.battle!.chosenAttacks = { player: 'x', opponent: 'triangle' };
      resolveBattle(state);

      const xDmg = palmon.attacks!.x.power;
      const agumonTriDmg = agumon.attacks!.triangle.power;
      expect(state.players.player.battleDigimon!.currentHp).toBe(400 + xDmg - agumonTriDmg);
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(agumon.hp - xDmg);
    });

    it('26. executes Crash (deals current HP + X attack boosts as damage and reduces own HP to 10)', () => {
      // #025 BomberNanimon (C, Fire, X: 0 power, Crash)
      const state = createBattleReadyState({
        playerCardId: 25,
        playerHp: 750,
        opponentCardId: 14,
        opponentHp: 700,
      });
      state.battle!.chosenAttacks = { player: 'x', opponent: 'triangle' };
      resolveBattle(state);

      // BomberNanimon deals 750 damage (KO'ing 700 HP Greymon) and survives at 10 HP!
      expect(state.players.opponent.battleDigimon).toBeNull();
      expect(state.players.player.battleDigimon!.currentHp).toBe(10);
      expect(state.players.player.koCount).toBe(1);
    });

    it('27. executes Jamming (nullifies opponent printed X-attack ability)', () => {
      // #168 ClearAgumon (R, Rare, X: Jamming) vs #030 Muchomon (R, Fire, X: [[x]] Counter)
      const clearAgumon = getCardById(168)!;
      const muchomon = getCardById(30)!;
      const state = createBattleReadyState({
        playerCardId: 168,
        opponentCardId: 30,
      });
      state.battle!.chosenAttacks = { player: 'x', opponent: 'x' };
      resolveBattle(state);

      // ClearAgumon hits Muchomon; Muchomon's [[x]] Counter is Jammed, so Muchomon deals 0!
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(
        muchomon.hp - clearAgumon.attacks!.x.power,
      );
      expect(state.players.player.battleDigimon!.currentHp).toBe(clearAgumon.hp);
    });

    it('28. executes <Specialty> Foe x3 (triples X attack power when opponent matches specialty)', () => {
      // #032 D-Otamamon (R, Fire, X: Ice Foe x3) vs #062 Gabumon (R, Ice)
      const dOtamamon = getCardById(32)!;
      const gabumon = getCardById(62)!;
      const state = createBattleReadyState({
        playerCardId: 32,
        opponentCardId: 62,
      });
      state.battle!.chosenAttacks = { player: 'x', opponent: 'triangle' };
      resolveBattle(state);

      const expectedDamage = dOtamamon.attacks!.x.power * 3;
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(gabumon.hp - expectedDamage);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Support Execution, Blind Deck-Top Support & Void Support Scopes
  // -------------------------------------------------------------------------
  describe('Support Cards & Void Support Scopes', () => {
    it('29. plays Support from Hand vs Blind from Top of Online Deck', () => {
      const agumon = getCardById(27)!;
      const gabumon = getCardById(62)!;
      let state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
        playerHand: [264], // #264 Attack Chip (+300 Atk)
      });
      // Put #266 Recovery Floppy (+300 HP) on top of opponent's online deck
      state.players.opponent.online.unshift(266);

      state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'circle' });
      state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'circle' });
      state = applyAction(state, { type: 'playSupportFromHand', side: 'player', handIndex: 0 });
      state = applyAction(state, { type: 'playSupportFromDeckTop', side: 'opponent' });

      const pDmg = agumon.attacks!.circle.power + 300;
      const oHpAfter = gabumon.hp + 300 - pDmg;
      const pHpAfter = agumon.hp - gabumon.attacks!.circle.power;

      expect(state.players.opponent.battleDigimon!.currentHp).toBe(oHpAfter);
      expect(state.players.player.battleDigimon!.currentHp).toBe(pHpAfter);
    });

    it('30. voidSupport with scope "support" voids Digimon supports (#006) but NOT Option cards (#264)', () => {
      const agumon = getCardById(27)!;
      const gabumon = getCardById(62)!;

      // #043 WaruSeadramon support: `{ op: 'voidSupport', target: 'opponent', scope: 'support' }`
      // Case A: Opponent plays Digimon support #006 RealMetalGreymon (+300 Atk) -> VOIDED!
      const state1 = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
      });
      state1.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
      state1.battle!.supportCards = {
        player: { cardId: 43, source: 'hand' },
        opponent: { cardId: 6, source: 'hand' },
      };
      resolveBattle(state1);
      expect(state1.events.some((e) => e.type === 'supportVoided' && e.side === 'opponent')).toBe(
        true,
      );
      expect(state1.players.player.battleDigimon!.currentHp).toBe(
        agumon.hp - gabumon.attacks!.circle.power,
      );

      // Case B: Opponent plays Option card #264 Attack Chip (+300 Atk) -> NOT voided by scope 'support'!
      const state2 = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
      });
      state2.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
      state2.battle!.supportCards = {
        player: { cardId: 43, source: 'hand' },
        opponent: { cardId: 264, source: 'hand' },
      };
      resolveBattle(state2);
      expect(state2.events.some((e) => e.type === 'supportVoided')).toBe(false);
      // Opponent got +300 boost, KO'ing Agumon
      expect(state2.players.player.battleDigimon).toBeNull();
    });

    it('31. voidSupport with scope "supportAndOption" (#253 Cherrymon’s Mist / #289 Mystic Sevens) voids Option cards too', () => {
      const agumon = getCardById(27)!;
      const gabumon = getCardById(62)!;
      const state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
      });
      state.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
      state.battle!.supportCards = {
        player: { cardId: 253, source: 'hand' }, // Cherrymon's Mist
        opponent: { cardId: 264, source: 'hand' }, // Attack Chip (Option)
      };
      resolveBattle(state);

      expect(state.events.some((e) => e.type === 'supportVoided' && e.cardId === 264)).toBe(true);
      expect(state.players.player.battleDigimon!.currentHp).toBe(
        agumon.hp - gabumon.attacks!.circle.power,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. KO Handling, DP Persistence, Revive on KO, 3-KO Win & Deck-Out Win
  // -------------------------------------------------------------------------
  describe('KO Persistence, Revive-on-KO & Win Conditions', () => {
    it('32. moves KO’d Digimon stack to offline while keeping DP Slot intact, and carries surviving HP to next turn', () => {
      let state = createBattleReadyState({
        playerCardId: 14, // Greymon
        opponentCardId: 27, // Agumon (set to 400 HP so it gets KO'd by Greymon's circle)
        opponentHp: 400,
      });
      state.players.opponent.battleDigimon!.stack = [175]; // Stack beneath opponent
      state.players.opponent.dpSlot = [27, 29];
      state.players.opponent.dpTotal = 40;
      state.players.player.battleDigimon!.currentHp = 620;

      state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'circle' });
      state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'circle' });
      state = applyAction(state, { type: 'passSupport', side: 'player' });
      state = applyAction(state, { type: 'passSupport', side: 'opponent' });

      // Player scored 1 KO, surviving Greymon kept 620 HP
      expect(state.players.player.koCount).toBe(1);
      expect(state.players.player.battleDigimon!.currentHp).toBe(620);
      // Opponent's DP slot was preserved across KO!
      expect(state.players.opponent.dpSlot).toEqual([27, 29]);
      expect(state.players.opponent.dpTotal).toBe(40);
      // Next turn (Turn 2) starts with opponent needing to place a new Rookie
      expect(state.turnNumber).toBe(2);
      expect(state.phase).toBe('rookiePlacement');
      expect(state.activePlayer).toBe('opponent');
    });

    it('33. executes reviveOnKo (#003 Phoenixmon / #239 Miracle Ruby): awards +1 KO point to foe, but keeps Digimon in play with revived HP', () => {
      const state = createBattleReadyState({
        playerCardId: 27,
        playerHp: 200, // Will be KO'd by Gabumon's circle
        opponentCardId: 62,
      });
      state.players.player.battleDigimon!.stack = [175];
      state.battle!.chosenAttacks = { player: 'triangle', opponent: 'circle' };
      state.battle!.supportCards = {
        player: { cardId: 239, source: 'hand' }, // #239 Miracle Ruby: revive with 1000 HP
        opponent: null,
      };

      resolveBattle(state);

      // Opponent still gets +1 KO point ("Battle is still lost")
      expect(state.players.opponent.koCount).toBe(1);
      // But Player's Digimon stack stays in battleDigimon with 1000 HP!
      expect(state.players.player.battleDigimon).not.toBeNull();
      expect(state.players.player.battleDigimon!.currentHp).toBe(1000);
      expect(state.players.player.battleDigimon!.stack).toEqual([175]);
    });

    it('34. awards match victory (`three_ko`) when a player reaches 3 KOs (even if opponent played reviveOnKo on 3rd KO)', () => {
      const state = createBattleReadyState({
        playerCardId: 9, // MetalGreymon
        opponentCardId: 27,
        opponentHp: 300,
      });
      state.players.player.koCount = 2; // Already at 2 KOs
      state.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
      state.battle!.supportCards = {
        player: null,
        opponent: { cardId: 3, source: 'hand' }, // #003 Phoenixmon (revive 500 HP)
      };

      resolveBattle(state);

      expect(state.players.player.koCount).toBe(3);
      expect(state.winner).toBe('player');
      expect(state.winReason).toBe('three_ko');
      expect(state.phase).toBe('gameOver');
    });

    it('35. awards match victory (`opponent_deck_out`) when a player cannot fulfill required draw during Draw Phase', () => {
      let state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
      });
      // Empty opponent's online deck and leave only 2 cards in opponent's hand
      state.players.opponent.online = [];
      state.players.opponent.hand = [27, 29];

      state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'triangle' });
      state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'triangle' });
      state = applyAction(state, { type: 'passSupport', side: 'player' });
      state = applyAction(state, { type: 'passSupport', side: 'opponent' });

      // Turn 2 starts -> opponent tries to draw 2 cards from empty online deck -> loses by opponent_deck_out!
      expect(state.phase).toBe('gameOver');
      expect(state.winner).toBe('player');
      expect(state.winReason).toBe('opponent_deck_out');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Effect DSL Interpreter Operations & Rounding Rules
  // -------------------------------------------------------------------------
  describe('Effect DSL Interpreter & Rounding Rules', () => {
    it('36. floors division by 2 to nearest multiple of 10 and clamps non-damage HP to minimum 10', () => {
      expect(applyNumericMode(550, 'divide', 2, 'hp')).toBe(270); // 275 -> 270
      expect(applyNumericMode(370, 'divide', 2, 'attackPower')).toBe(180); // 185 -> 180
      expect(applyNumericMode(10, 'divide', 2, 'hp')).toBe(10); // Min 10 HP floor
      expect(applyNumericMode(10, 'divide', 2, 'attackPower')).toBe(0); // Attack power can hit 0
      expect(applyNumericMode(100, 'sub', 500, 'attackPower')).toBe(0);
      expect(applyNumericMode(100, 'sub', 500, 'hp')).toBe(10);
    });

    it('37. tracks lastMovedCount accurately for Ogremon (#122), Hagurumon (#166), and Metal Parts (#228)', () => {
      const agumon = getCardById(27)!;
      const state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
        playerHand: [27, 29, 14], // 3 cards in hand
      });
      state.players.player.dpSlot = [27, 29]; // 2 DP cards
      state.players.player.dpTotal = 40;
      state.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };

      const ctx = createEffectExecContext(state, 'player');
      // Execute #122 Ogremon: discard all DP cards (2) and multiply Attack Power by 2
      executeEffectOps(
        [
          { op: 'discardDp', target: 'self', count: 'all' },
          { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } },
        ],
        ctx,
      );
      expect(ctx.lastMovedCount).toBe(2);
      expect(state.battle!.computedPowers.player).toBe(agumon.attacks!.circle.power * 2);
      expect(state.players.player.dpSlot).toHaveLength(0);
    });

    it('38. executes rotateAttack (#263 Disrupt Ray) and dynamically activates/deactivates printed X-attack ability', () => {
      const agumon = getCardById(27)!;
      // Opponent #027 Agumon chooses triangle, Player plays #263 Disrupt Ray (rotates triangle -> x)
      // Because Agumon is rotated into 'x', Agumon's printed `[[circle]] to 0` becomes active!
      const state = createBattleReadyState({
        playerCardId: 62, // Gabumon
        opponentCardId: 27, // Agumon (X: [[circle]] to 0)
      });
      state.battle!.chosenAttacks = { player: 'circle', opponent: 'triangle' };
      state.battle!.supportCards = {
        player: { cardId: 263, source: 'hand' }, // Disrupt Ray
        opponent: null,
      };

      resolveBattle(state);

      expect(state.battle!.effectiveAttacks?.opponent).toBe('x');
      // Agumon's newly active [[circle]] to 0 reduced Gabumon's circle attack to 0!
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(agumon.hp);
    });

    it('39. executes copyStats (#256 Data Copy), swapHp (#254 Hacking), and swapSpecialty (#144 Digitamamon)', () => {
      const vikemon = getCardById(34)!;
      const state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 34, // Vikemon (U, Ice)
      });
      state.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
      const ctx = createEffectExecContext(state, 'player');

      // #256 Data Copy
      executeEffectOps(
        [{ op: 'copyStats', from: 'opponent', stats: ['attackPower', 'hp', 'specialty'] }],
        ctx,
      );
      expect(state.battle!.computedPowers.player).toBe(vikemon.attacks!.circle.power);
      expect(state.players.player.battleDigimon!.currentHp).toBe(vikemon.hp);
      expect(state.players.player.battleDigimon!.effectiveSpecialty).toBe('Ice');

      // Swap HP and Specialty
      state.players.player.battleDigimon!.currentHp = 300;
      state.players.player.battleDigimon!.effectiveSpecialty = 'Fire';
      executeEffectOps([{ op: 'swapHp' }, { op: 'swapSpecialty' }], ctx);
      expect(state.players.player.battleDigimon!.currentHp).toBe(vikemon.hp);
      expect(state.players.opponent.battleDigimon!.currentHp).toBe(300);
      expect(state.players.player.battleDigimon!.effectiveSpecialty).toBe('Ice');
      expect(state.players.opponent.battleDigimon!.effectiveSpecialty).toBe('Fire');
    });

    it('40. executes searchDeck (#257 Partner Finder), recycleOffline (#247 Digimon Analyzer), and handToDeck (#156 Nanimon)', () => {
      const state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
        playerHand: [264, 266],
      });
      state.players.player.online = [27, 175, 14]; // #175 Veemon is 'R P'
      state.players.player.offline = [9, 2];

      const ctx = createEffectExecContext(state, 'player');

      // #257 Partner Finder: finds #175 Veemon and moves to hand
      executeEffectOps(
        [
          {
            op: 'searchDeck',
            target: 'self',
            filter: { levels: ['R P'] },
            count: 1,
            selection: 'random',
            to: 'hand',
            shuffleAfter: true,
          },
        ],
        ctx,
      );
      expect(state.players.player.hand).toContain(175);
      expect(state.players.player.online).not.toContain(175);

      // #154 PlatinumSukamon: recycle top 1 card from offline to online top
      executeEffectOps(
        [{ op: 'recycleOffline', target: 'self', count: 1, shuffle: false, position: 'top' }],
        ctx,
      );
      expect(state.players.player.online[0]).toBe(2);
      expect(state.players.player.offline).toEqual([9]);

      // #156 Nanimon: return hand to online deck and shuffle
      executeEffectOps([{ op: 'handToDeck', target: 'self', shuffle: true }], ctx);
      expect(state.players.player.hand).toHaveLength(0);
      expect(state.players.player.online).toHaveLength(6);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Information Hiding (`getVisibleState`)
  // -------------------------------------------------------------------------
  describe('Information Hiding (getVisibleState)', () => {
    it('41. hides opponent hand card IDs and unrevealed chosen attack while preserving counts', () => {
      let state = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
        playerHand: [27, 14, 264],
        opponentHand: [62, 46, 266, 264],
      });

      // Opponent chooses attack first
      state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'x' });

      const visibleToPlayer = getVisibleState(state, 'player');
      expect(visibleToPlayer.players.player.hand).toEqual([27, 14, 264]);
      expect(visibleToPlayer.players.player.handCount).toBe(3);
      // Opponent's hand array is empty (hidden), but handCount is 4
      expect(visibleToPlayer.players.opponent.hand).toEqual([]);
      expect(visibleToPlayer.players.opponent.handCount).toBe(4);
      // Opponent's chosen attack is masked as 'hidden' until player also selects
      expect(visibleToPlayer.battle?.chosenAttacks.opponent).toBe('hidden');

      // Once player also selects an attack, both chosenAttacks are revealed
      state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'circle' });
      const visibleAfter = getVisibleState(state, 'player');
      expect(visibleAfter.battle?.chosenAttacks.player).toBe('circle');
      expect(visibleAfter.battle?.chosenAttacks.opponent).toBe('x');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Direct C/U Entry Stat Penalty & Partner Digi-Parts Customization
  // -------------------------------------------------------------------------
  describe('Direct C/U Entry Penalty & Partner Digi-Parts', () => {
    it('42. applies 1/2 stat penalty on direct C entry and 1/4 stat penalty on direct U entry', () => {
      const greymon = getCardById(14)!; // C, Fire
      const metalGreymon = getCardById(9)!; // U, Fire

      // Direct Champion (C) placement -> 1/2 HP and Attack Powers
      const stateC = createMatch({
        playerDeck: buildTestDeck(),
        opponentDeck: buildTestDeck(),
        seed: 5150,
        firstPlayer: 'player',
        config: { enableMulligan: false },
      });
      stateC.players.player.battleDigimon = null;
      stateC.players.player.hand = [14, 27];
      const placedC = applyAction(stateC, { type: 'placeRookie', side: 'player', handIndex: 0 });
      expect(placedC.players.player.battleDigimon!.cardId).toBe(14);
      expect(placedC.players.player.battleDigimon!.statPenaltyDivisor).toBe(2);
      expect(placedC.players.player.battleDigimon!.currentHp).toBe(
        applyNumericMode(greymon.hp, 'divide', 2, 'hp')
      );
      expect(getActiveDigimonSlotPowers(placedC, 'player')).toEqual({
        circle: applyNumericMode(greymon.attacks!.circle.power, 'divide', 2, 'attackPower'),
        triangle: applyNumericMode(greymon.attacks!.triangle.power, 'divide', 2, 'attackPower'),
        x: applyNumericMode(greymon.attacks!.x.power, 'divide', 2, 'attackPower'),
      });

      // Direct Ultimate (U) placement -> 1/4 HP and Attack Powers
      const stateU = createMatch({
        playerDeck: buildTestDeck(),
        opponentDeck: buildTestDeck(),
        seed: 5151,
        firstPlayer: 'player',
        config: { enableMulligan: false },
      });
      stateU.players.player.battleDigimon = null;
      stateU.players.player.hand = [9, 27];
      const placedU = applyAction(stateU, { type: 'placeRookie', side: 'player', handIndex: 0 });
      expect(placedU.players.player.battleDigimon!.cardId).toBe(9);
      expect(placedU.players.player.battleDigimon!.statPenaltyDivisor).toBe(4);
      expect(placedU.players.player.battleDigimon!.currentHp).toBe(
        applyNumericMode(metalGreymon.hp, 'divide', 4, 'hp')
      );
      expect(getActiveDigimonSlotPowers(placedU, 'player')).toEqual({
        circle: applyNumericMode(metalGreymon.attacks!.circle.power, 'divide', 4, 'attackPower'),
        triangle: applyNumericMode(metalGreymon.attacks!.triangle.power, 'divide', 4, 'attackPower'),
        x: applyNumericMode(metalGreymon.attacks!.x.power, 'divide', 4, 'attackPower'),
      });
    });

    it('43. carries 1/2 penalty when penalized C evolves normally to U, but clears penalty with Special or Download Digivolve', () => {
      const metalGreymon = getCardById(9)!;

      const makePenalizedCState = (hand: CardId[], dp = metalGreymon.dp): MatchState => {
        const s = createMatch({
          playerDeck: buildTestDeck(),
          opponentDeck: buildTestDeck(),
          seed: 6160,
          firstPlayer: 'player',
          config: { enableMulligan: false },
        });
        s.phase = 'digivolve';
        s.activePlayer = 'player';
        s.players.player.battleDigimon = {
          cardId: 14, // #014 Greymon (C, Fire)
          stack: [],
          currentHp: 300,
          maxHp: 300,
          effectiveSpecialty: 'Fire',
          statPenaltyDivisor: 2,
        };
        s.players.player.dpSlot = [27, 29];
        s.players.player.dpTotal = dp;
        s.players.player.hand = hand;
        return s;
      };

      // Normal C -> U keeps 1/2 penalty on the new U card
      const normalEvo = applyAction(makePenalizedCState([9]), {
        type: 'digivolve',
        side: 'player',
        handIndex: 0,
      });
      expect(normalEvo.players.player.battleDigimon!.cardId).toBe(9);
      expect(normalEvo.players.player.battleDigimon!.statPenaltyDivisor).toBe(2);
      expect(normalEvo.players.player.battleDigimon!.currentHp).toBe(
        applyNumericMode(metalGreymon.hp, 'divide', 2, 'hp')
      );
      expect(getActiveDigimonSlotPowers(normalEvo, 'player').circle).toBe(
        applyNumericMode(metalGreymon.attacks!.circle.power, 'divide', 2, 'attackPower')
      );

      // #295 Special Digivolve removes stat penalty on new U card
      let specialEvo = makePenalizedCState([295, 9]);
      specialEvo = applyAction(specialEvo, {
        type: 'useDigivolveOption',
        side: 'player',
        handIndex: 0,
      });
      specialEvo = applyAction(specialEvo, { type: 'digivolve', side: 'player', handIndex: 0 });
      expect(specialEvo.players.player.battleDigimon!.cardId).toBe(9);
      expect(specialEvo.players.player.battleDigimon!.statPenaltyDivisor).toBeUndefined();
      expect(specialEvo.players.player.battleDigimon!.currentHp).toBe(metalGreymon.hp);
      expect(getActiveDigimonSlotPowers(specialEvo, 'player').circle).toBe(
        metalGreymon.attacks!.circle.power
      );

      // #293 Download Digivolve also removes stat penalty on new U card
      let downloadEvo = makePenalizedCState([293, 9], 0);
      downloadEvo = applyAction(downloadEvo, {
        type: 'useDigivolveOption',
        side: 'player',
        handIndex: 0,
      });
      downloadEvo = applyAction(downloadEvo, { type: 'digivolve', side: 'player', handIndex: 0 });
      expect(downloadEvo.players.player.battleDigimon!.cardId).toBe(9);
      expect(downloadEvo.players.player.battleDigimon!.statPenaltyDivisor).toBeUndefined();
      expect(downloadEvo.players.player.battleDigimon!.currentHp).toBe(metalGreymon.hp);
    });

    it('44. supports 128 Digi-Parts, max 3 equipped per Partner, Partner stat/Armor carryover, and selectedArmorCardId restriction', () => {
      expect(ALL_DIGI_PARTS).toHaveLength(128);
      const baseVeemon = getCardById(175)!;
      const baseMagnamon = getCardById(173)!;

      let store = createDefaultDeckStoreState();
      // Equip 3 Digi-Parts on Veemon (#175): #003 HP +200, #010 Circle +100, #039 +20 DP
      store = equipDigiPartToPartner(store, 175, 3);
      store = equipDigiPartToPartner(store, 175, 10);
      store = equipDigiPartToPartner(store, 175, 39);
      expect(store.partnerConfigs[175]!.equippedParts).toEqual([3, 10, 39]);

      // Adding a 4th non-exclusive part is blocked at max 3
      const capped = equipDigiPartToPartner(store, 175, 0);
      expect(capped.partnerConfigs[175]!.equippedParts).toEqual([3, 10, 39]);

      // Select #173 Magnamon as Veemon's battle Armor
      store = updatePartnerConfig(store, 175, { selectedArmorCardId: 173 });

      const effVeemon = getEffectiveCardData(175, store.partnerConfigs)!;
      expect(effVeemon.hp).toBe(baseVeemon.hp + 200);
      expect(effVeemon.attacks!.circle.power).toBe(baseVeemon.attacks!.circle.power + 100);
      expect(effVeemon.plusP).toBe(baseVeemon.plusP + 20);

      // Stats carry over into Magnamon (#173)
      const effMagnamon = getEffectiveCardData(173, store.partnerConfigs)!;
      expect(effMagnamon.hp).toBe(baseMagnamon.hp + 200);
      expect(effMagnamon.attacks!.circle.power).toBe(baseMagnamon.attacks!.circle.power + 100);

      // In rookiePlacement, legal Armor action for Veemon is restricted to #173 Magnamon
      const match = createMatch({
        playerDeck: buildTestDeck(),
        opponentDeck: buildTestDeck(),
        seed: 7070,
        firstPlayer: 'player',
        config: {
          enableMulligan: false,
          partnerConfig: { player: store.partnerConfigs },
        },
      });
      match.players.player.battleDigimon = null;
      match.players.player.hand = [175, 27];

      const veemonArmorChoices = getLegalActions(match, 'player').filter(
        (a): a is Extract<Action, { type: 'placeRookie' }> =>
          a.type === 'placeRookie' && a.handIndex === 0 && a.armorCardId !== undefined
      );
      expect(veemonArmorChoices).toHaveLength(1);
      expect(veemonArmorChoices[0]!.armorCardId).toBe(173);

      // Deploying non-selected #172 throws while #173 deploys with boosted HP & Circle power
      expect(() =>
        applyAction(match, {
          type: 'placeRookie',
          side: 'player',
          handIndex: 0,
          armorCardId: 172,
        })
      ).toThrow();

      const deployed = applyAction(match, {
        type: 'placeRookie',
        side: 'player',
        handIndex: 0,
        armorCardId: 173,
      });
      expect(deployed.players.player.battleDigimon!.cardId).toBe(173);
      expect(deployed.players.player.battleDigimon!.currentHp).toBe(baseMagnamon.hp + 200);
      expect(getActiveDigimonSlotPowers(deployed, 'player').circle).toBe(
        baseMagnamon.attacks!.circle.power + 100
      );

      // Also verify [Sup Effect] Digi-Part (#043 Boost Attack +200) and [Effect] Digi-Part (#035 1st Attack, X -100)
      let supStore = createDefaultDeckStoreState();
      supStore = equipDigiPartToPartner(supStore, 175, 35);
      supStore = equipDigiPartToPartner(supStore, 175, 43);
      const battleState = createBattleReadyState({
        playerCardId: 27,
        opponentCardId: 62,
        playerHand: [175, 27],
      });
      battleState.config.partnerConfig = { player: supStore.partnerConfigs };
      battleState.phase = 'supportSelect';
      battleState.activePlayer = 'player';
      battleState.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
      const afterSup = applyAction(battleState, {
        type: 'playSupportFromHand',
        side: 'player',
        handIndex: 0,
      });
      const resolved = applyAction(afterSup, { type: 'passSupport', side: 'opponent' });
      const agumonCircle = getCardById(27)!.attacks!.circle.power;
      const gabumonHp = getCardById(62)!.hp;
      expect(resolved.players.opponent.battleDigimon!.currentHp).toBe(
        Math.max(0, gabumonHp - (agumonCircle + 200))
      );
    });
  });
});
