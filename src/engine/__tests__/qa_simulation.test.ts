import { describe, expect, it } from 'vitest';
import { chooseAiAction } from '../../ai';
import { ALL_CARDS, getCardById, mustGetCardById } from '../../data/cards';
import {
  EFFECT_REGISTRY,
  getCardEffect,
  isBattleSupportOption,
  isDigivolvePhaseOption,
} from '../../data/effects';
import { ALL_BASE_DECKS, OPPONENTS } from '../../data/opponents';
import type {
  AttackSlot,
  CardData,
  CardId,
  MatchState,
  PlayerSide,
} from '../../types/game';
import { DECK_SIZE } from '../../types/game';
import {
  applyAction,
  computeDpTotal,
  createMatch,
  getLegalActions,
  getVisibleState,
  resolveBattle,
} from '../index';

/**
 * Counts all cards belonging to `side` across all zones in `state`.
 */
function countPlayerCardsInAllZones(state: MatchState, side: PlayerSide): number {
  const p = state.players[side];
  const battleCount = p.battleDigimon
    ? (getCardById(p.battleDigimon.cardId)?.level === 'A' ? 0 : 1) +
      p.battleDigimon.stack.filter((id) => getCardById(id)?.level !== 'A').length
    : 0;
  const supportCount = state.battle?.supportCards[side] ? 1 : 0;
  return (
    p.online.length +
    p.hand.length +
    p.dpSlot.length +
    p.offline.length +
    battleCount +
    supportCount
  );
}

/**
 * Asserts all match state invariants for both players after any action or resolution step.
 */
function assertMatchStateInvariants(state: MatchState, contextLabel: string): void {
  for (const side of ['player', 'opponent'] as const) {
    const p = state.players[side];
    const totalCards = countPlayerCardsInAllZones(state, side);
    expect(
      totalCards,
      `[${contextLabel}] ${side} total card conservation violated (got ${totalCards}, expected ${DECK_SIZE})`,
    ).toBe(DECK_SIZE);

    expect(
      p.koCount,
      `[${contextLabel}] ${side} koCount out of bounds: ${p.koCount}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      p.koCount,
      `[${contextLabel}] ${side} koCount out of bounds: ${p.koCount}`,
    ).toBeLessThanOrEqual(3);

    expect(
      p.dpTotal,
      `[${contextLabel}] ${side} dpTotal mismatch with dpSlot`,
    ).toBe(computeDpTotal(p.dpSlot));

    if (p.battleDigimon) {
      expect(
        p.battleDigimon.currentHp,
        `[${contextLabel}] ${side} active Digimon currentHp < 0`,
      ).toBeGreaterThanOrEqual(0);

      if (state.phase !== 'battleResolve' && state.phase !== 'gameOver') {
        expect(
          p.battleDigimon.currentHp,
          `[${contextLabel}] ${side} active Digimon currentHp < 1 during non-battle phase ${state.phase}`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  }
}

/**
 * Determines which player side has legal actions in the current state.
 */
function getActingSide(state: MatchState): PlayerSide | null {
  if (state.phase === 'gameOver' || state.winner !== null) return null;
  const activeLegal = getLegalActions(state, state.activePlayer);
  if (activeLegal.length > 0) return state.activePlayer;

  const other: PlayerSide = state.activePlayer === 'player' ? 'opponent' : 'player';
  const otherLegal = getLegalActions(state, other);
  if (otherLegal.length > 0) return other;

  return null;
}

describe('Task 8: QA & Headless AI-vs-AI Simulation Suite', () => {
  // -------------------------------------------------------------------------
  // 1. All 138 Canonical Base Decks Playability & Invariant Suite
  // -------------------------------------------------------------------------
  describe('1. All 138 Canonical Base Decks Headless AI-vs-AI Simulation', () => {
    it('verifies all 138 base decks and 138 opponents are present and have 30 valid cards each', () => {
      expect(ALL_BASE_DECKS.length).toBe(138);
      expect(OPPONENTS.length).toBe(138);

      for (const deck of ALL_BASE_DECKS) {
        expect(deck.cards.length, `Deck ${deck.id} does not have 30 cards`).toBe(DECK_SIZE);
        for (const cardId of deck.cards) {
          const card = getCardById(cardId);
          expect(card, `Deck ${deck.id} references invalid cardId ${cardId}`).toBeDefined();
        }
      }
    });

    it('runs 75+ full headless AI-vs-AI matches covering every single one of the 138 canonical base decks with strict per-action invariant checks', () => {
      const coveredDeckIds = new Set<string>();
      const matchPairings: Array<{
        playerDeckIdx: number;
        opponentDeckIdx: number;
        seed: number;
        difficulty: 'easy' | 'normal' | 'hard';
      }> = [];

      // 69 primary pairings covering all 138 decks (0 vs 1, 2 vs 3, ..., 136 vs 137)
      const difficulties: Array<'easy' | 'normal' | 'hard'> = ['easy', 'normal', 'hard'];
      for (let i = 0; i < ALL_BASE_DECKS.length; i += 2) {
        const pIdx = i;
        const oIdx = (i + 1) % ALL_BASE_DECKS.length;
        matchPairings.push({
          playerDeckIdx: pIdx,
          opponentDeckIdx: oIdx,
          seed: 1000 + i * 37,
          difficulty: difficulties[(i / 2) % difficulties.length]!,
        });
      }

      // Additional cross-tier / special showcase matches (75 total matches)
      const extraPairs: Array<[number, number, 'easy' | 'normal' | 'hard']> = [
        [0, 137, 'hard'], // First Tutorial Deck vs Final Deck
        [10, 50, 'normal'],
        [25, 95, 'hard'],
        [40, 120, 'easy'],
        [70, 130, 'hard'],
        [100, 135, 'normal'],
      ];
      extraPairs.forEach(([pIdx, oIdx, diff], idx) => {
        matchPairings.push({
          playerDeckIdx: pIdx,
          opponentDeckIdx: oIdx,
          seed: 9000 + idx * 101,
          difficulty: diff,
        });
      });

      expect(matchPairings.length).toBeGreaterThanOrEqual(75);

      const MAX_STEPS_PER_MATCH = 1500;
      const winReasonCounts: Record<string, number> = {
        three_ko: 0,
        opponent_deck_out: 0,
        opponent_no_rookie: 0,
      };

      for (let m = 0; m < matchPairings.length; m++) {
        const { playerDeckIdx, opponentDeckIdx, seed, difficulty } = matchPairings[m]!;
        const playerDeckDef = ALL_BASE_DECKS[playerDeckIdx]!;
        const opponentDeckDef = ALL_BASE_DECKS[opponentDeckIdx]!;

        coveredDeckIds.add(playerDeckDef.id);
        coveredDeckIds.add(opponentDeckDef.id);

        let state = createMatch({
          playerDeck: playerDeckDef.cards,
          opponentDeck: opponentDeckDef.cards,
          seed,
        });

        const matchLabel = `Match #${m + 1} (${playerDeckDef.name} vs ${opponentDeckDef.name}, seed=${seed})`;
        assertMatchStateInvariants(state, `${matchLabel} [init]`);

        let steps = 0;
        while (state.phase !== 'gameOver' && state.winner === null && steps < MAX_STEPS_PER_MATCH) {
          const actingSide = getActingSide(state);
          expect(
            actingSide,
            `${matchLabel} step ${steps}: no acting side in non-terminal phase ${state.phase}`,
          ).not.toBeNull();

          const action = chooseAiAction(state, actingSide!, difficulty);
          expect(action.side).toBe(actingSide);

          state = applyAction(state, action);
          steps += 1;

          assertMatchStateInvariants(state, `${matchLabel} [step ${steps}, action=${action.type}]`);

          // Periodically verify getVisibleState open-hand & secret-battle invariants
          if (steps % 25 === 0) {
            const visPlayer = getVisibleState(state, 'player');
            const visOpp = getVisibleState(state, 'opponent');
            expect(visPlayer.players.opponent.hand).toHaveLength(visPlayer.players.opponent.handCount);
            expect(visOpp.players.player.hand).toHaveLength(visOpp.players.player.handCount);
            expect(visPlayer.players.player.handCount).toBe(state.players.player.hand.length);
            expect(visOpp.players.opponent.handCount).toBe(state.players.opponent.hand.length);
            if (state.phase === 'attackSelect' || state.phase === 'supportSelect') {
              if (!state.battle?.supportDecided?.player || !state.battle?.supportDecided?.opponent) {
                if (state.battle?.chosenAttacks.opponent) {
                  expect(visPlayer.battle?.chosenAttacks.opponent).toBe('hidden');
                }
                if (state.battle?.chosenAttacks.player) {
                  expect(visOpp.battle?.chosenAttacks.player).toBe('hidden');
                }
              }
            }
          }
        }

        expect(
          steps,
          `${matchLabel} exceeded max step bound (${MAX_STEPS_PER_MATCH})`,
        ).toBeLessThan(MAX_STEPS_PER_MATCH);
        expect(state.phase, `${matchLabel} did not end in gameOver phase`).toBe('gameOver');
        expect(
          ['player', 'opponent', 'draw'].includes(state.winner as string),
          `${matchLabel} invalid winner: ${String(state.winner)}`,
        ).toBe(true);
        expect(
          ['three_ko', 'opponent_deck_out', 'opponent_no_rookie'].includes(
            state.winReason as string,
          ),
          `${matchLabel} invalid winReason: ${String(state.winReason)}`,
        ).toBe(true);

        if (state.winReason) {
          winReasonCounts[state.winReason] = (winReasonCounts[state.winReason] ?? 0) + 1;
        }
      }

      // Every single one of the 138 canonical base decks was exercised
      expect(coveredDeckIds.size).toBe(138);
      // Matches naturally finish via KO or Deck-Out
      expect(
        winReasonCounts.three_ko! +
          winReasonCounts.opponent_deck_out! +
          winReasonCounts.opponent_no_rookie!,
      ).toBe(matchPairings.length);
    });
  });

  // -------------------------------------------------------------------------
  // 2. All 301 Card Effects Stress Test
  // -------------------------------------------------------------------------
  describe('2. All 301 Card Effects Stress Test (000..300)', () => {
    /**
     * Helper to build a rich 30-card controlled match state in `'supportSelect'` phase
     * where every zone (online, hand, dpSlot, offline, battleDigimon with stack) is populated
     * so card-moving, stat-scaling, devolve, DP-discard, and offline-recycle ops all execute
     * non-trivially while maintaining the 30-card invariant per player.
     */
    function createControlledSupportBattleState(params: {
      supportCardId: CardId;
      supportSide: PlayerSide;
      otherSupportCardId?: CardId | null;
      playerActiveId?: CardId;
      opponentActiveId?: CardId;
      playerAttack?: AttackSlot;
      opponentAttack?: AttackSlot;
      seed?: number;
    }): MatchState {
      const pActiveId = params.playerActiveId ?? 9; // #009 MetalGreymon (U, Fire, 1100 HP)
      const oActiveId = params.opponentActiveId ?? 40; // #040 WereGarurumon (U, Ice, 1000 HP)
      const pCard = mustGetCardById(pActiveId);
      const oCard = mustGetCardById(oActiveId);

      // Build 30-card state per side:
      // - battleDigimon: 1 active + 2 in stack = 3 cards
      // - supportCards: 0 initially (will be played from hand or placed)
      // - hand: 4 cards (index 0 is supportCardId for supportSide)
      // - dpSlot: 3 cards (e.g. [27, 29, 30])
      // - offline: 5 cards (e.g. [14, 15, 16, 264, 266])
      // - online: 15 cards (diverse R, R P, C, U, A, Option cards across all specialties for searchDeck/useTopCardSupport)
      // Total = 3 + 4 + 3 + 5 + 15 = 30 cards!
      const makeSideState = (
        activeCard: CardData,
        handCard0: CardId,
      ): MatchState['players']['player'] => {
        // Level A active Digimon are virtual evolutions whose stack contains the underlying 3 deck cards
        const stack: CardId[] = activeCard.level === 'A' ? [175, 27, 14] : [27, 14];
        const hand: CardId[] = [handCard0, 27, 62, 264];
        const dpSlot: CardId[] = [27, 29, 62];
        const offline: CardId[] = [14, 15, 264, 266, 27];
        const online: CardId[] = [
          175, // Veemon (R P, Fire) - for Partner Finder
          182, // Hawkmon (R P, Nature)
          27, // Agumon (R, Fire)
          62, // Gabumon (R, Ice)
          98, // Tentomon (R, Nature)
          134, // DemiDevimon (R, Darkness)
          164, // ToyAgumon (R, Rare)
          14, // Greymon (C, Fire)
          50, // Garurumon (C, Ice)
          83, // Kabuterimon (C, Nature)
          118, // Devimon (C, Darkness)
          155, // Numemon (C, Rare)
          2, // WarGreymon (U, Fire)
          183, // Patamon (R P, Nature)
          266, // Recovery Floppy (Option)
        ];

        return {
          online,
          hand,
          battleDigimon: {
            cardId: activeCard.id,
            stack,
            currentHp: activeCard.hp,
            maxHp: activeCard.hp,
            effectiveSpecialty: activeCard.specialty ?? 'Fire',
          },
          dpSlot,
          dpTotal: computeDpTotal(dpSlot),
          offline,
          koCount: 1,
          activeDigivolveModifier: null,
        };
      };

      const pHand0 = params.supportSide === 'player' ? params.supportCardId : (params.otherSupportCardId ?? 266);
      const oHand0 = params.supportSide === 'opponent' ? params.supportCardId : (params.otherSupportCardId ?? 266);

      const playerAttack = params.playerAttack ?? 'circle';
      const opponentAttack = params.opponentAttack ?? 'triangle';

      const state: MatchState = {
        players: {
          player: makeSideState(pCard, pHand0),
          opponent: makeSideState(oCard, oHand0),
        },
        turnNumber: 3,
        activePlayer: 'player',
        phase: 'supportSelect',
        mulliganDecided: { player: true, opponent: true },
        battle: {
          firstAttacker: 'player',
          defender: 'opponent',
          chosenAttacks: { player: playerAttack, opponent: opponentAttack },
          effectiveAttacks: { player: playerAttack, opponent: opponentAttack },
          supportCards: { player: null, opponent: null },
          supportDecided: { player: false, opponent: false },
          computedPowers: {
            player: pCard.attacks?.[playerAttack].power ?? 0,
            opponent: oCard.attacks?.[opponentAttack].power ?? 0,
          },
          grantedAbilities: { player: [], opponent: [] },
          abilityRemoved: { player: false, opponent: false },
          reviveOnKo: { player: null, opponent: null },
        },
        winner: null,
        events: [{ type: 'matchStarted', firstPlayer: 'player', seed: params.seed ?? 42 }],
        rngSeed: params.seed ?? 42,
        config: {
          unspecifiedSelection: 'random',
          allowPartnerCards: true,
          enableMulligan: false,
        },
      };

      assertMatchStateInvariants(state, `ControlledSupportInit(card=${params.supportCardId})`);
      return state;
    }

    it('verifies getCardEffect(cardId) returns a valid definition for all 301 cards (0..300)', () => {
      expect(ALL_CARDS.length).toBe(301);
      for (let cardId = 0; cardId <= 300; cardId++) {
        const card = mustGetCardById(cardId);
        const effectDef = getCardEffect(cardId);
        expect(effectDef).toBeDefined();
        expect(effectDef.cardId).toBe(cardId);
        expect(EFFECT_REGISTRY[cardId]).toBe(effectDef);
        expect(effectDef.ops.length).toBeGreaterThan(0);

        if (cardId <= 190) {
          expect(card.kind).toBe('Digimon');
          expect(effectDef.timing).toBe('support');
        } else if (cardId <= 292) {
          expect(card.kind).toBe('Option');
          expect(effectDef.timing).toBe('support');
          expect(isBattleSupportOption(cardId)).toBe(true);
        } else {
          expect(card.kind).toBe('Option');
          expect(effectDef.timing).toBe('digivolvePhase');
          expect(isDigivolvePhaseOption(cardId)).toBe(true);
        }
      }
    });

    it('executes all 293 battle support cards (0..292) as BOTH player and opponent across multiple combat scenarios without errors or invariant violations', () => {
      // Scenarios to trigger diverse conditional branches (same vs different attacks, lower vs higher level/HP, specialties)
      const scenarios: Array<{
        playerActiveId: CardId;
        opponentActiveId: CardId;
        playerAttack: AttackSlot;
        opponentAttack: AttackSlot;
      }> = [
        // Scenario A: U Fire vs U Ice, different attacks (circle vs triangle)
        { playerActiveId: 9, opponentActiveId: 40, playerAttack: 'circle', opponentAttack: 'triangle' },
        // Scenario B: R Nature vs A Darkness/Rare, same attacks (x vs x)
        { playerActiveId: 98, opponentActiveId: 172, playerAttack: 'x', opponentAttack: 'x' },
        // Scenario C: C Darkness vs R Rare, same attacks (circle vs circle)
        { playerActiveId: 118, opponentActiveId: 164, playerAttack: 'circle', opponentAttack: 'circle' },
      ];

      for (let cardId = 0; cardId <= 292; cardId++) {
        const effectDef = getCardEffect(cardId);
        expect(effectDef.timing).toBe('support');

        for (const supportSide of ['player', 'opponent'] as const) {
          for (let sIdx = 0; sIdx < scenarios.length; sIdx++) {
            const scen = scenarios[sIdx]!;
            const state = createControlledSupportBattleState({
              supportCardId: cardId,
              supportSide,
              otherSupportCardId: 273, // #273 Digi-Garnet (+100 Atk) so voidSupport also has a target to void
              playerActiveId: scen.playerActiveId,
              opponentActiveId: scen.opponentActiveId,
              playerAttack: scen.playerAttack,
              opponentAttack: scen.opponentAttack,
              seed: 10000 + cardId * 13 + sIdx * 7 + (supportSide === 'player' ? 1 : 2),
            });

            // Step 1: Player chooses support (handIndex 0 is the support card under test or opponent's Digi-Garnet)
            const s1 = applyAction(state, {
              type: 'playSupportFromHand',
              side: 'player',
              handIndex: 0,
            });
            assertMatchStateInvariants(
              s1,
              `SupportCard #${cardId} (${supportSide}, scen=${sIdx}) after player support`,
            );

            // Step 2: Opponent chooses support (triggers resolveBattle + turn handover!)
            const s2 = applyAction(s1, {
              type: 'playSupportFromHand',
              side: 'opponent',
              handIndex: 0,
            });
            assertMatchStateInvariants(
              s2,
              `SupportCard #${cardId} (${supportSide}, scen=${sIdx}) after battle resolution`,
            );

            // Verify supportTriggered or supportVoided event was emitted for cardId
            const triggeredOrVoided = s2.events.some(
              (e) =>
                (e.type === 'supportTriggered' && e.side === supportSide && e.cardId === cardId) ||
                (e.type === 'supportVoided' && e.side === supportSide && e.cardId === cardId),
            );
            expect(
              triggeredOrVoided,
              `SupportCard #${cardId} (${supportSide}) was neither triggered nor voided`,
            ).toBe(true);
          }
        }
      }
    });

    it('exercises all 8 digivolve-phase Option cards (293..300) via getLegalActions and applyAction(useDigivolveOption) for both player and opponent', () => {
      /**
       * Helper to construct a 30-card controlled state in `'digivolve'` phase for `side`.
       */
      function createControlledDigivolveState(params: {
        side: PlayerSide;
        activeCardId: CardId;
        stack: CardId[];
        hand: CardId[];
        dpSlot: CardId[];
      }): MatchState {
        const makeSide = (
          activeCardId: CardId,
          stack: CardId[],
          hand: CardId[],
          dpSlot: CardId[],
        ): MatchState['players']['player'] => {
          const activeCard = mustGetCardById(activeCardId);
          const nonArmorBattleCount =
            (activeCard.level === 'A' ? 0 : 1) +
            stack.filter((id) => getCardById(id)?.level !== 'A').length;
          const usedCount = nonArmorBattleCount + hand.length + dpSlot.length;
          const offline: CardId[] = [264, 266];
          const onlineCount = DECK_SIZE - usedCount - offline.length;
          const online: CardId[] = Array.from({ length: onlineCount }, (_, i) =>
            i % 2 === 0 ? 27 : 62,
          );
          return {
            online,
            hand: [...hand],
            battleDigimon: {
              cardId: activeCard.id,
              stack: [...stack],
              currentHp: activeCard.hp,
              maxHp: activeCard.hp,
              effectiveSpecialty: activeCard.specialty ?? 'Fire',
            },
            dpSlot: [...dpSlot],
            dpTotal: computeDpTotal(dpSlot),
            offline,
            koCount: 0,
            activeDigivolveModifier: null,
          };
        };

        const state: MatchState = {
          players: {
            player:
              params.side === 'player'
                ? makeSide(params.activeCardId, params.stack, params.hand, params.dpSlot)
                : makeSide(27, [], [27, 14, 264, 266], []),
            opponent:
              params.side === 'opponent'
                ? makeSide(params.activeCardId, params.stack, params.hand, params.dpSlot)
                : makeSide(62, [], [62, 50, 264, 266], []),
          },
          turnNumber: 2,
          activePlayer: params.side,
          phase: 'digivolve',
          mulliganDecided: { player: true, opponent: true },
          battle: null,
          winner: null,
          events: [{ type: 'matchStarted', firstPlayer: params.side, seed: 777 }],
          rngSeed: 777,
          config: {
            unspecifiedSelection: 'random',
            allowPartnerCards: true,
            enableMulligan: false,
          },
        };

        assertMatchStateInvariants(state, `DigivolveStateInit(${params.side})`);
        return state;
      }

      for (const side of ['player', 'opponent'] as const) {
        // -------------------------------------------------------------------
        // 293: Download Digivolve — Can digivolve regardless of Specialty, Level, or DP
        // Active: #027 Agumon (R, Fire), Hand: [293, 40 (WereGarurumon, U, Ice, 40 DP)], 0 DP
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(293).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 27, // Agumon (R, Fire)
            stack: [],
            hand: [293, 40, 264, 266], // #040 WereGarurumon (U, Ice, 40 DP)
            dpSlot: [],
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 293)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `293 Download Digivolve (${side}) after option`);
          expect(s1.players[side].activeDigivolveModifier?.ignoreSpecialty).toBe(true);
          expect(s1.players[side].activeDigivolveModifier?.ignoreLevel).toBe(true);
          expect(s1.players[side].activeDigivolveModifier?.ignoreDp).toBe(true);

          // Now #040 WereGarurumon (at handIndex 0 after removing 293) is legally digivolvable!
          const legal1 = getLegalActions(s1, side);
          expect(legal1.some((a) => a.type === 'digivolve' && a.cardId === 40)).toBe(true);

          const s2 = applyAction(s1, { type: 'digivolve', side, handIndex: 0 });
          assertMatchStateInvariants(s2, `293 Download Digivolve (${side}) after digivolve`);
          expect(s2.players[side].battleDigimon?.cardId).toBe(40);
        }

        // -------------------------------------------------------------------
        // 294: ArmorCrush Digivolve — Digivolve a Level A Digimon to C or U (DP needed, same specialty)
        // Active: #172 Flamedramon (A, Fire) with stack [175], Hand: [294, 9 (MetalGreymon, U, Fire, 40 DP)]
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(294).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 172, // Flamedramon (A, Fire)
            stack: [175], // Veemon underneath
            hand: [294, 9, 264, 266], // #009 MetalGreymon (U, Fire, 40 DP)
            dpSlot: [27, 29], // 20 + 20 = 40 DP
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 294)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `294 ArmorCrush Digivolve (${side}) after option`);

          const legal1 = getLegalActions(s1, side);
          expect(legal1.some((a) => a.type === 'digivolve' && a.cardId === 9)).toBe(true);

          const s2 = applyAction(s1, { type: 'digivolve', side, handIndex: 0 });
          assertMatchStateInvariants(s2, `294 ArmorCrush Digivolve (${side}) after digivolve`);
          expect(s2.players[side].battleDigimon?.cardId).toBe(9);
        }

        // -------------------------------------------------------------------
        // 295: Special Digivolve — Ignore Specialty + extraDp +20
        // Active: #027 Agumon (R, Fire), Hand: [295, 50 (Seadramon, C, Ice, 40 DP)], 20 DP in slot
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(295).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 27, // Agumon (R, Fire)
            stack: [],
            hand: [295, 50, 264, 266], // #050 Seadramon (C, Ice, 40 DP)
            dpSlot: [27], // 20 DP + 20 extraDp = 40 DP!
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 295)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `295 Special Digivolve (${side}) after option`);
          expect(s1.players[side].activeDigivolveModifier?.ignoreSpecialty).toBe(true);
          expect(s1.players[side].activeDigivolveModifier?.extraDp).toBe(20);

          const legal1 = getLegalActions(s1, side);
          expect(legal1.some((a) => a.type === 'digivolve' && a.cardId === 50)).toBe(true);

          const s2 = applyAction(s1, { type: 'digivolve', side, handIndex: 0 });
          assertMatchStateInvariants(s2, `295 Special Digivolve (${side}) after digivolve`);
          expect(s2.players[side].battleDigimon?.cardId).toBe(50);
        }

        // -------------------------------------------------------------------
        // 296: Mutant Digivolve — Same Level allowed, Ignore Specialty (Need DP)
        // Active: #014 Greymon (C, Fire), Hand: [296, 50 (Seadramon, C, Ice, 40 DP)], 40 DP in slot
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(296).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 14, // Greymon (C, Fire)
            stack: [27],
            hand: [296, 50, 264, 266], // #050 Seadramon (C, Ice, 40 DP)
            dpSlot: [27, 29], // 40 DP
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 296)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `296 Mutant Digivolve (${side}) after option`);

          const legal1 = getLegalActions(s1, side);
          expect(legal1.some((a) => a.type === 'digivolve' && a.cardId === 50)).toBe(true);

          const s2 = applyAction(s1, { type: 'digivolve', side, handIndex: 0 });
          assertMatchStateInvariants(s2, `296 Mutant Digivolve (${side}) after digivolve`);
          expect(s2.players[side].battleDigimon?.cardId).toBe(50);
        }

        // -------------------------------------------------------------------
        // 297: Warp Digivolve — Digivolve from R to U (DP needed, same specialty)
        // Active: #027 Agumon (R, Fire), Hand: [297, 9 (MetalGreymon, U, Fire, 40 DP)], 40 DP in slot
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(297).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 27, // Agumon (R, Fire)
            stack: [],
            hand: [297, 9, 264, 266], // #009 MetalGreymon (U, Fire, 40 DP)
            dpSlot: [27, 29], // 40 DP
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 297)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `297 Warp Digivolve (${side}) after option`);

          const legal1 = getLegalActions(s1, side);
          expect(legal1.some((a) => a.type === 'digivolve' && a.cardId === 9)).toBe(true);

          const s2 = applyAction(s1, { type: 'digivolve', side, handIndex: 0 });
          assertMatchStateInvariants(s2, `297 Warp Digivolve (${side}) after digivolve`);
          expect(s2.players[side].battleDigimon?.cardId).toBe(9);
        }

        // -------------------------------------------------------------------
        // 298: De-Armor Digivolve — Downgrade a Level A Digimon to Level R
        // Active: #172 Flamedramon (A, Fire) with stack [175 (Veemon, R P)]
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(298).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 172, // Flamedramon (A)
            stack: [175], // Veemon (R P)
            hand: [298, 27, 264, 266],
            dpSlot: [],
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 298)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `298 De-Armor Digivolve (${side}) after option`);
          expect(s1.players[side].battleDigimon?.cardId).toBe(175);
          expect(s1.players[side].battleDigimon?.stack).toHaveLength(0);
          expect(s1.players[side].offline).not.toContain(172);
          expect(s1.players[side].offline).toContain(298);
        }

        // -------------------------------------------------------------------
        // 299: Speed Digivolve — Can disregard DP in digivolving ( keeps DP Slot intact!)
        // Active: #027 Agumon (R, Fire), Hand: [299, 14 (Greymon, C, Fire, 20 DP)], dpSlot: [27]
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(299).timing).toBe('digivolvePhase');
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 27, // Agumon (R, Fire)
            stack: [],
            hand: [299, 14, 264, 266], // #014 Greymon (C, Fire)
            dpSlot: [27], // 1 card in DP slot — should be preserved when ignoreDp is true!
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 299)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `299 Speed Digivolve (${side}) after option`);
          expect(s1.players[side].activeDigivolveModifier?.ignoreDp).toBe(true);

          const s2 = applyAction(s1, { type: 'digivolve', side, handIndex: 0 });
          assertMatchStateInvariants(s2, `299 Speed Digivolve (${side}) after digivolve`);
          expect(s2.players[side].battleDigimon?.cardId).toBe(14);
          expect(s2.players[side].dpSlot).toHaveLength(1);
        }

        // -------------------------------------------------------------------
        // 300: Digi-devolve — Downgrade own digivolution by 1 Level; HP double when successful
        // Active: #014 Greymon (C, Fire) with stack [27 (Agumon, R, Fire, 600 HP)]
        // -------------------------------------------------------------------
        {
          expect(getCardEffect(300).timing).toBe('digivolvePhase');
          const agumonCard = mustGetCardById(27);
          const s0 = createControlledDigivolveState({
            side,
            activeCardId: 14, // Greymon (C, Fire)
            stack: [27], // Agumon (R, Fire) underneath
            hand: [300, 29, 264, 266],
            dpSlot: [],
          });
          const legal0 = getLegalActions(s0, side);
          expect(legal0.some((a) => a.type === 'useDigivolveOption' && a.cardId === 300)).toBe(true);

          const s1 = applyAction(s0, { type: 'useDigivolveOption', side, handIndex: 0 });
          assertMatchStateInvariants(s1, `300 Digi-devolve (${side}) after option`);
          expect(s1.players[side].battleDigimon?.cardId).toBe(27);
          expect(s1.players[side].battleDigimon?.stack).toHaveLength(0);
          expect(s1.players[side].battleDigimon?.currentHp).toBe(agumonCard.hp * 2);
          expect(s1.players[side].offline).toContain(14);
          expect(s1.players[side].offline).toContain(300);
        }
      }
    });

    it('directly exercises resolveBattle with every support card (0..292) when played from Deck Top (playSupportFromDeckTop)', () => {
      for (let cardId = 0; cardId <= 292; cardId++) {
        const state = createControlledSupportBattleState({
          supportCardId: 266,
          supportSide: 'player',
          seed: 50000 + cardId,
        });
        // Put cardId on top of player's Online Deck (swapping with online[0] to keep 30 cards)
        state.players.player.online[0] = cardId;
        assertMatchStateInvariants(state, `DeckTopSupport #${cardId} init`);

        const s1 = applyAction(state, { type: 'playSupportFromDeckTop', side: 'player' });
        assertMatchStateInvariants(s1, `DeckTopSupport #${cardId} after playSupportFromDeckTop`);
        expect(s1.battle?.supportCards.player?.cardId).toBe(cardId);
        expect(s1.battle?.supportCards.player?.source).toBe('deckTop');

        const s2 = applyAction(s1, { type: 'passSupport', side: 'opponent' });
        assertMatchStateInvariants(s2, `DeckTopSupport #${cardId} after resolveBattle`);
      }

      // Also verify that playing a Digivolve-phase Option card (293..300) via playSupportFromDeckTop
      // safely fizzles without throwing, emitting supportTriggered, or violating invariants
      for (let cardId = 293; cardId <= 300; cardId++) {
        const state = createControlledSupportBattleState({
          supportCardId: 266,
          supportSide: 'player',
          seed: 60000 + cardId,
        });
        const eventsBefore = state.events.length;
        state.players.player.online[0] = cardId;
        const s1 = applyAction(state, { type: 'playSupportFromDeckTop', side: 'player' });
        const s2 = applyAction(s1, { type: 'passSupport', side: 'opponent' });
        assertMatchStateInvariants(s2, `DeckTopFizzle #${cardId} after resolveBattle`);
        expect(s2.players.player.offline).toContain(cardId);
        const newEvents = s2.events.slice(eventsBefore);
        expect(
          newEvents.some((e) => e.type === 'supportTriggered' && e.side === 'player')
        ).toBe(false);
      }

      // Direct unit call to resolveBattle export to ensure direct invocation works cleanly
      const directState = createControlledSupportBattleState({
        supportCardId: 0,
        supportSide: 'player',
        seed: 77777,
      });
      directState.battle!.supportCards.player = {
        cardId: directState.players.player.hand.shift()!,
        source: 'hand',
      };
      resolveBattle(directState);
      assertMatchStateInvariants(directState, 'Direct resolveBattle call');
    });
  });
});
