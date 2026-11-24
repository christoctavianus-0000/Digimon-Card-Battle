import { describe, expect, it } from 'vitest';
import { getCardByName } from '../../data/cards';
import { OPPONENTS, STARTER_DECKS } from '../../data/opponents';
import { applyAction, cloneMatchState, createMatch, getLegalActions, getVisibleState } from '../../engine';
import type { Action, MatchPhase, MatchState, PlayerSide } from '../../types/game';
import { type AiDifficulty, chooseAiAction } from '../index';

/**
 * Helper to check if an action returned by `chooseAiAction` is present in `getLegalActions(state, side)`.
 */
function isActionLegal(state: MatchState, side: PlayerSide, action: Action): boolean {
  const legal = getLegalActions(state, side);
  return legal.some((l) => JSON.stringify(l) === JSON.stringify(action));
}

/**
 * Advances a match by one step using the AI difficulty configured for each side.
 */
function stepAiMatch(
  state: MatchState,
  difficulties: Record<PlayerSide, AiDifficulty>,
): MatchState {
  const activeSide: PlayerSide =
    getLegalActions(state, state.activePlayer).length > 0
      ? state.activePlayer
      : state.activePlayer === 'player'
        ? 'opponent'
        : 'player';

  const action = chooseAiAction(state, activeSide, difficulties[activeSide]);
  expect(isActionLegal(state, activeSide, action)).toBe(true);
  return applyAction(state, action);
}

describe('AI Engine (Easy, Normal, Hard)', () => {
  const deckA = STARTER_DECKS[0]?.cards ?? OPPONENTS[0]!.cards;
  const deckB = STARTER_DECKS[1]?.cards ?? OPPONENTS[1]!.cards;

  describe('1. Legal Action Verification Across All Interactive Phases', () => {
    const difficulties: AiDifficulty[] = ['easy', 'normal', 'hard'];

    for (const diff of difficulties) {
      it(`always returns a legal action in every phase for '${diff}' AI`, () => {
        const visitedPhases = new Set<MatchPhase>();
        let state = createMatch({
          playerDeck: deckA,
          opponentDeck: deckB,
          seed: 101,
          firstPlayer: 'player',
        });

        let steps = 0;
        const maxSteps = 500;

        while (state.phase !== 'gameOver' && state.winner === null && steps < maxSteps) {
          visitedPhases.add(state.phase);
          const side: PlayerSide =
            getLegalActions(state, state.activePlayer).length > 0
              ? state.activePlayer
              : state.activePlayer === 'player'
                ? 'opponent'
                : 'player';

          const action = chooseAiAction(state, side, diff);
          expect(isActionLegal(state, side, action)).toBe(true);
          state = applyAction(state, action);
          steps += 1;
        }

        expect(visitedPhases.has('mulligan')).toBe(true);
        expect(visitedPhases.has('rookiePlacement')).toBe(true);
        expect(visitedPhases.has('digivolve')).toBe(true);
        expect(visitedPhases.has('attackSelect')).toBe(true);
        expect(visitedPhases.has('supportSelect')).toBe(true);
        expect(state.phase).toBe('gameOver');
        expect(state.winner).not.toBeNull();
      });
    }
  });

  describe('2. Strict Information Hiding (Fair AI — Never Cheats)', () => {
    it('makes identical decisions when online deck order or unrevealed attack/support selections change, while seeing open hands', () => {
      const difficulties: AiDifficulty[] = ['easy', 'normal', 'hard'];
      let state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 2026,
        firstPlayer: 'player',
      });

      const phasesChecked = new Set<MatchPhase>();
      let steps = 0;

      while (
        phasesChecked.size < 5 &&
        state.phase !== 'gameOver' &&
        state.winner === null &&
        steps < 80
      ) {
        const side: PlayerSide =
          getLegalActions(state, state.activePlayer).length > 0
            ? state.activePlayer
            : state.activePlayer === 'player'
              ? 'opponent'
              : 'player';
        const oppSide: PlayerSide = side === 'player' ? 'opponent' : 'player';

        // PS1 Open Hand invariant: getVisibleState exposes opponent's open hand (and reconstructs unrevealed Support-from-hand)
        const vis = getVisibleState(state, side);
        if (state.phase === 'supportSelect' && vis.battle?.supportCards[oppSide]?.cardId === null) {
          expect(vis.players[oppSide].hand.length).toBeGreaterThanOrEqual(
            state.players[oppSide].hand.length
          );
        } else {
          expect(vis.players[oppSide].hand).toEqual(state.players[oppSide].hand);
        }

        for (const diff of difficulties) {
          const baseDecision = chooseAiAction(state, side, diff);

          // Mutation A: Reverse and permute both players' hidden online decks (keeping length identical)
          const mutatedOnline = cloneMatchState(state);
          mutatedOnline.players[side].online = [...mutatedOnline.players[side].online].reverse();
          mutatedOnline.players[oppSide].online = [
            ...mutatedOnline.players[oppSide].online,
          ].reverse();
          const onlineDecision = chooseAiAction(mutatedOnline, side, diff);
          expect(onlineDecision).toEqual(baseDecision);

          // Mutation B: If in attackSelect or unrevealed supportSelect, mutate opponent's hidden attack/support
          if (state.phase === 'attackSelect' || state.phase === 'supportSelect') {
            const mutatedBattle = cloneMatchState(state);
            if (mutatedBattle.battle) {
              if (state.phase === 'attackSelect') {
                mutatedBattle.battle.chosenAttacks[oppSide] = 'x';
              } else {
                mutatedBattle.battle.chosenAttacks[oppSide] =
                  mutatedBattle.battle.chosenAttacks[oppSide] === 'circle' ? 'triangle' : 'circle';
                if (mutatedBattle.battle.effectiveAttacks) {
                  mutatedBattle.battle.effectiveAttacks[oppSide] =
                    mutatedBattle.battle.chosenAttacks[oppSide];
                }
                if (mutatedBattle.battle.supportDecided?.[oppSide]) {
                  if (mutatedBattle.battle.supportCards[oppSide]) {
                    mutatedBattle.battle.supportCards[oppSide] = {
                      ...mutatedBattle.battle.supportCards[oppSide]!,
                      cardId: 200,
                    };
                  }
                }
              }
            }
            const battleDecision = chooseAiAction(mutatedBattle, side, diff);
            expect(battleDecision).toEqual(baseDecision);
          }
        }

        phasesChecked.add(state.phase);
        const nextAction = chooseAiAction(state, side, 'normal');
        state = applyAction(state, nextAction);
        steps += 1;
      }

      expect(phasesChecked.size).toBe(5);
    });
  });

  describe('3. Tactical Heuristics & Multi-Step Planning (Normal & Hard AI)', () => {
    it('prioritizes 0-DP Armor Evolution when deploying a Partner Rookie in rookiePlacement', () => {
      const veemon = getCardByName('Veemon')!;
      const flamedramon = getCardByName('Flamedramon')!;
      const agumon = getCardByName('Agumon')!;

      const state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 42,
        firstPlayer: 'player',
      });

      state.phase = 'rookiePlacement';
      state.activePlayer = 'player';
      state.players.player.battleDigimon = null;
      state.players.player.hand = [veemon.id, agumon.id];
      state.players.player.dpSlot = [agumon.id];
      state.players.player.dpTotal = agumon.plusP;

      const expectedVeemonArmors = new Set([flamedramon.id, 173, 185]);
      for (const diff of ['normal', 'hard'] as const) {
        const action = chooseAiAction(state, 'player', diff);
        expect(action.type).toBe('placeRookie');
        if (action.type === 'placeRookie') {
          expect(action.handIndex).toBe(0);
          expect(action.armorCardId).toBeDefined();
          expect(expectedVeemonArmors.has(action.armorCardId!)).toBe(true);
        }
      }
    });

    it('plans multi-step addToDp -> digivolve sequence in Hard & Normal AI without sacrificing the evolution card', () => {
      const agumon = getCardByName('Agumon')!;
      const greymon = getCardByName('Greymon')!;
      const biyomon = getCardByName('Biyomon')!;

      const state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 77,
        firstPlayer: 'player',
      });

      state.phase = 'digivolve';
      state.activePlayer = 'player';
      state.players.player.battleDigimon = {
        cardId: agumon.id,
        stack: [],
        currentHp: agumon.hp,
        maxHp: agumon.hp,
        effectiveSpecialty: agumon.specialty!,
      };
      // Greymon requires 30 DP; player currently has 20 DP in dpSlot.
      // Adding Biyomon (+20 P) brings dpTotal to 40, unlocking Greymon digivolution!
      state.players.player.dpSlot = [biyomon.id];
      state.players.player.dpTotal = 20;
      state.players.player.hand = [greymon.id, biyomon.id];

      const step1 = chooseAiAction(state, 'player', 'hard');
      expect(step1).toEqual({
        type: 'addToDp',
        side: 'player',
        handIndex: 1,
        cardId: biyomon.id,
      });

      const afterStep1 = applyAction(state, step1);
      const step2 = chooseAiAction(afterStep1, 'player', 'hard');
      expect(step2).toEqual({
        type: 'digivolve',
        side: 'player',
        handIndex: 0,
        cardId: greymon.id,
      });
    });

    it('digivolves BEFORE adding new DP when current DP is already sufficient, preserving new DP for Ultimate', () => {
      const agumon = getCardByName('Agumon')!;
      const greymon = getCardByName('Greymon')!;
      const warGreymon = getCardByName('WarGreymon')!;
      const biyomon = getCardByName('Biyomon')!;

      const state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 99,
        firstPlayer: 'player',
      });

      state.phase = 'digivolve';
      state.activePlayer = 'player';
      state.players.player.battleDigimon = {
        cardId: agumon.id,
        stack: [],
        currentHp: agumon.hp,
        maxHp: agumon.hp,
        effectiveSpecialty: agumon.specialty!,
      };
      // Already has 40 DP (enough for Greymon!)
      state.players.player.dpSlot = [biyomon.id, biyomon.id];
      state.players.player.dpTotal = 40;
      state.players.player.hand = [biyomon.id, greymon.id, warGreymon.id];

      for (const diff of ['normal', 'hard'] as const) {
        const firstAct = chooseAiAction(state, 'player', diff);
        expect(firstAct.type).toBe('digivolve');
      }
    });

    it('selects <Specialty> Foe x3 attack when facing a matching specialty opponent', () => {
      const warGreymon = getCardByName('WarGreymon')!; // X attack: 380 power, Ice Foe x3 -> 1140 vs Ice!
      const garurumon = getCardByName('Garurumon')!; // Ice Champion

      const state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 123,
        firstPlayer: 'player',
      });

      state.phase = 'attackSelect';
      state.activePlayer = 'player';
      state.players.player.battleDigimon = {
        cardId: warGreymon.id,
        stack: [],
        currentHp: warGreymon.hp,
        maxHp: warGreymon.hp,
        effectiveSpecialty: 'Fire',
      };
      state.players.opponent.battleDigimon = {
        cardId: garurumon.id,
        stack: [],
        currentHp: 1100, // 900 circle won't KO 1100 HP, but 380 * 3 = 1140 X attack one-shot KOs!
        maxHp: 1100,
        effectiveSpecialty: 'Ice',
      };
      state.players.player.hand = [];
      state.battle = {
        firstAttacker: 'player',
        defender: 'opponent',
        chosenAttacks: { player: null, opponent: null },
        supportCards: { player: null, opponent: null },
        computedPowers: { player: 0, opponent: 0 },
      };

      for (const diff of ['normal', 'hard'] as const) {
        const act = chooseAiAction(state, 'player', diff);
        expect(act).toEqual({
          type: 'chooseAttack',
          side: 'player',
          slot: 'x',
        });
      }
    });

    it('uses Speed Digivolve option when holding a matching evolution without enough DP', () => {
      const agumon = getCardByName('Agumon')!;
      const greymon = getCardByName('Greymon')!;
      const speedDigivolve = getCardByName('Speed Digivolve')!;

      const state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 321,
        firstPlayer: 'player',
      });

      state.phase = 'digivolve';
      state.activePlayer = 'player';
      state.players.player.battleDigimon = {
        cardId: agumon.id,
        stack: [],
        currentHp: agumon.hp,
        maxHp: agumon.hp,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.dpSlot = [];
      state.players.player.dpTotal = 0;
      state.players.player.hand = [speedDigivolve.id, greymon.id];

      for (const diff of ['normal', 'hard'] as const) {
        const step1 = chooseAiAction(state, 'player', diff);
        expect(step1).toEqual({
          type: 'useDigivolveOption',
          side: 'player',
          handIndex: 0,
          cardId: speedDigivolve.id,
        });
        const afterOpt = applyAction(state, step1);
        const step2 = chooseAiAction(afterOpt, 'player', diff);
        expect(step2).toEqual({
          type: 'digivolve',
          side: 'player',
          handIndex: 0,
          cardId: greymon.id,
        });
      }
    });

    it('plays an Attack Disk support when it turns a hit into a one-shot KO, and passes when already guaranteed to KO', () => {
      const agumon = getCardByName('Agumon')!; // circle = 290
      const attackDiskO = getCardByName('Attack Disk ○')!; // Boost own ○ +300 (or +200/+300)

      const state = createMatch({
        playerDeck: deckA,
        opponentDeck: deckB,
        seed: 555,
        firstPlayer: 'player',
      });

      state.phase = 'supportSelect';
      state.activePlayer = 'player';
      state.players.player.battleDigimon = {
        cardId: agumon.id,
        stack: [],
        currentHp: 500,
        maxHp: 500,
        effectiveSpecialty: 'Fire',
      };
      state.players.opponent.battleDigimon = {
        cardId: agumon.id,
        stack: [],
        currentHp: 450, // 290 circle alone won't KO, but with Attack Disk ○ it one-shot KOs!
        maxHp: 500,
        effectiveSpecialty: 'Fire',
      };
      state.players.player.hand = [attackDiskO.id];
      state.battle = {
        firstAttacker: 'player',
        defender: 'opponent',
        chosenAttacks: { player: 'circle', opponent: 'circle' },
        effectiveAttacks: { player: 'circle', opponent: 'circle' },
        supportCards: { player: null, opponent: null },
        supportDecided: { player: false, opponent: false },
        computedPowers: { player: 290, opponent: 290 },
      };

      const playAct = chooseAiAction(state, 'player', 'hard');
      expect(playAct.type).toBe('playSupportFromHand');

      // Now if opponent only has 100 HP (already guaranteed 1-shot KO with 290 circle!), conserve the card
      state.players.opponent.battleDigimon.currentHp = 100;
      const conserveAct = chooseAiAction(state, 'player', 'hard');
      expect(conserveAct.type).toBe('passSupport');
    });
  });

  describe('4. Full AI-vs-AI Simulation Benchmark (Hard vs Easy, 60 Symmetric Games)', () => {
    it('completes 60 full games cleanly and Hard AI achieves >= 70% win rate over Easy AI', () => {
      // Pick 15 diverse canonical opponent decks and run 4 games per matchup
      // (2 seeds x 2 swapped sides = 60 games total) to completely control for deck & turn-order bias.
      const testDecks = OPPONENTS.slice(0, 15).map((opp) => opp.cards);

      let hardWins = 0;
      let easyWins = 0;
      let draws = 0;
      const totalGames = 60;

      for (let i = 0; i < 30; i++) {
        const d1 = testDecks[i % testDecks.length]!;
        const d2 = testDecks[(i + 3) % testDecks.length]!;
        const seed = 1000 + i * 17;

        // Game A: Hard plays 'player' with d1, Easy plays 'opponent' with d2
        {
          let state = createMatch({
            playerDeck: d1,
            opponentDeck: d2,
            seed,
            firstPlayer: i % 2 === 0 ? 'player' : 'opponent',
          });
          let stepCount = 0;
          while (state.phase !== 'gameOver' && state.winner === null && stepCount < 800) {
            state = stepAiMatch(state, { player: 'hard', opponent: 'easy' });
            stepCount += 1;
          }
          expect(state.phase).toBe('gameOver');
          expect(state.winner).not.toBeNull();
          if (state.winner === 'player') hardWins += 1;
          else if (state.winner === 'opponent') easyWins += 1;
          else draws += 1;
        }

        // Game B (Swapped Decks & Sides): Easy plays 'player' with d1, Hard plays 'opponent' with d2
        {
          let state = createMatch({
            playerDeck: d1,
            opponentDeck: d2,
            seed,
            firstPlayer: i % 2 === 0 ? 'player' : 'opponent',
          });
          let stepCount = 0;
          while (state.phase !== 'gameOver' && state.winner === null && stepCount < 800) {
            state = stepAiMatch(state, { player: 'easy', opponent: 'hard' });
            stepCount += 1;
          }
          expect(state.phase).toBe('gameOver');
          expect(state.winner).not.toBeNull();
          if (state.winner === 'opponent') hardWins += 1;
          else if (state.winner === 'player') easyWins += 1;
          else draws += 1;
        }
      }

      const hardWinRate = hardWins / totalGames;
      console.info(
        `[AI Benchmark] Hard vs Easy (60 symmetric games): Hard=${hardWins}, Easy=${easyWins}, Draws=${draws} (${(hardWinRate * 100).toFixed(1)}% Hard win rate)`,
      );
      expect(hardWins + easyWins + draws).toBe(totalGames);
      expect(hardWinRate).toBeGreaterThanOrEqual(0.7);
    }, 30000);
  });
});
