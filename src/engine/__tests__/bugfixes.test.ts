import { describe, expect, it } from 'vitest';
import { getCardById } from '../../data/cards';
import { OPPONENTS } from '../../data/opponents';
import type { CardEffectDef, EffectRegistry } from '../../types/effects';
import type { CardId, MatchState } from '../../types/game';
import {
  applyAction,
  canUseDigivolveOptionCard,
  createMatch,
  getLegalActions,
  getVisibleState,
  resolveBattle,
} from '../index';

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

function createControlledBattleState(): MatchState {
  const state = createMatch({
    playerDeck: buildTestDeck(),
    opponentDeck: buildTestDeck(),
    seed: 12345,
    firstPlayer: 'player',
    config: { enableMulligan: false },
  });

  const pCard = getCardById(27)!; // #027 Agumon
  const oCard = getCardById(62)!; // #062 Gabumon

  state.players.player.battleDigimon = {
    cardId: pCard.id,
    stack: [],
    currentHp: pCard.hp,
    maxHp: pCard.hp,
    effectiveSpecialty: pCard.specialty ?? 'Fire',
  };
  state.players.opponent.battleDigimon = {
    cardId: oCard.id,
    stack: [],
    currentHp: oCard.hp,
    maxHp: oCard.hp,
    effectiveSpecialty: oCard.specialty ?? 'Ice',
  };

  state.activePlayer = 'player';
  state.phase = 'attackSelect';
  state.battle = {
    firstAttacker: 'player',
    defender: 'opponent',
    chosenAttacks: { player: null, opponent: null },
    effectiveAttacks: { player: null, opponent: null },
    supportCards: { player: null, opponent: null },
    supportDecided: { player: false, opponent: false },
    computedPowers: { player: 0, opponent: 0 },
  };
  return state;
}

describe('Regression tests for engine bug fixes', () => {
  it('1. getVisibleState hides opponent effectiveAttacks and computedPowers until both attacks are chosen', () => {
    let state = createControlledBattleState();

    // Opponent acts first in attackSelect
    state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'triangle' });

    const playerViewBefore = getVisibleState(state, 'player');
    expect(playerViewBefore.battle?.chosenAttacks.opponent).toBe('hidden');
    expect(playerViewBefore.battle?.effectiveAttacks?.opponent).toBeNull();
    expect(playerViewBefore.battle?.computedPowers.opponent).toBe(0);

    // Opponent's own view can still see their own chosen attack and power
    const opponentViewBefore = getVisibleState(state, 'opponent');
    expect(opponentViewBefore.battle?.effectiveAttacks?.opponent).toBe('triangle');
    expect(opponentViewBefore.battle?.computedPowers.opponent).toBeGreaterThan(0);

    // Once player chooses, both sides' attacks & powers become visible
    state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'circle' });
    const playerViewAfter = getVisibleState(state, 'player');
    expect(playerViewAfter.battle?.chosenAttacks.opponent).toBe('triangle');
    expect(playerViewAfter.battle?.effectiveAttacks?.opponent).toBe('triangle');
    expect(playerViewAfter.battle?.computedPowers.opponent).toBeGreaterThan(0);
  });

  it('2. getVisibleState hides opponent supportCards until both sides have decided support', () => {
    let state = createControlledBattleState();
    state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'circle' });
    state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'circle' });

    state.players.opponent.hand = [264, 27, 29, 14];
    state.players.player.hand = [264, 27, 29, 14];

    // Opponent sets a support card before player decides
    state = applyAction(state, { type: 'playSupportFromHand', side: 'opponent', handIndex: 0 });
    expect(state.phase).toBe('supportSelect');

    const playerViewBefore = getVisibleState(state, 'player');
    expect(playerViewBefore.battle?.supportDecided?.opponent).toBe(true);
    expect(playerViewBefore.battle?.supportCards.opponent).toBeNull();

    // Opponent's own view still sees their own played support card
    const opponentViewBefore = getVisibleState(state, 'opponent');
    expect(opponentViewBefore.battle?.supportCards.opponent?.cardId).toBe(264);

    // Once player also decides support, battle resolves (or reveals support)
    state = applyAction(state, { type: 'passSupport', side: 'player' });
    const resolvedEvent = state.events.find(
      (e) => e.type === 'supportTriggered' && e.side === 'opponent'
    );
    expect(resolvedEvent).toBeDefined();
  });

  it('3. preserveDeckOrder keeps exact 30-card deck sequence unshuffled for Analogman', () => {
    const analogman = OPPONENTS.find((o) => o.id === 'opp-120-analogman');
    expect(analogman).toBeDefined();
    expect(analogman!.preserveExactOrder).toBe(true);

    const state = createMatch({
      playerDeck: buildTestDeck(),
      opponentDeck: analogman!.cards,
      seed: 987654,
      firstPlayer: 'player',
      config: {
        preserveDeckOrder: {
          opponent: Boolean(analogman!.preserveExactOrder),
        },
      },
    });

    expect(state.players.opponent.hand).toEqual(analogman!.cards.slice(0, 4));
    expect(state.players.opponent.online).toEqual(analogman!.cards.slice(4));
  });

  it('4. disableArmorOnCardIds forbids Armor Evolution during Partner deployment while allowing Normal Rookie placement', () => {
    const baseDeck = buildTestDeck();

    const makeArmorTestState = (disabled?: CardId[]): MatchState => {
      const s = createMatch({
        playerDeck: baseDeck,
        opponentDeck: baseDeck,
        seed: 555,
        firstPlayer: 'opponent',
        config: {
          enableMulligan: false,
          ...(disabled ? { disableArmorOnCardIds: { opponent: disabled } } : {}),
        },
      });
      s.players.opponent.battleDigimon = null;
      s.players.opponent.hand = [175, 27, 29, 14]; // #175 Veemon (R P)
      s.activePlayer = 'opponent';
      s.phase = 'rookiePlacement';
      return s;
    };

    // Without restriction, opponent can deploy Veemon as any of its 3 Armor forms or Normal Rookie
    const allowedState = makeArmorTestState(undefined);
    const allowedVeemonArmorActs = getLegalActions(allowedState, 'opponent').filter(
      (a) => a.type === 'placeRookie' && a.handIndex === 0 && a.armorCardId !== undefined
    );
    expect(allowedVeemonArmorActs.map((a) => (a as { armorCardId?: CardId }).armorCardId)).toEqual([
      172, 173, 185,
    ]);

    // With Veemon (#175) in disableArmorOnCardIds, Armor deployment options are blocked while Normal Rookie stays legal
    const blockedState = makeArmorTestState([175]);
    const blockedActs = getLegalActions(blockedState, 'opponent');
    expect(
      blockedActs.some(
        (a) => a.type === 'placeRookie' && a.handIndex === 0 && a.armorCardId !== undefined
      )
    ).toBe(false);
    expect(
      blockedActs.some(
        (a) => a.type === 'placeRookie' && a.handIndex === 0 && a.armorCardId === undefined
      )
    ).toBe(true);
    expect(() =>
      applyAction(blockedState, {
        type: 'placeRookie',
        side: 'opponent',
        handIndex: 0,
        armorCardId: 172,
      })
    ).toThrow();
  });

  it('5. voidSupport executes strictly in Substep 3A and is skipped in Substep 3B', () => {
    const state = createControlledBattleState();
    state.battle!.chosenAttacks = { player: 'circle', opponent: 'circle' };
    state.battle!.supportCards = {
      player: { cardId: 901, source: 'hand' },
      opponent: { cardId: 902, source: 'hand' },
    };

    // Custom registry:
    // 901 (Turn Player): in 3B shifts player's specialty to 'Darkness' and tries to boost own attack
    // 902 (Non-Turn Player): conditional voidSupport if opponent's specialty is 'Darkness'
    // Because player started as 'Fire' in Substep 3A, 902's voidSupport must NOT trigger later in 3B.
    const effect901: CardEffectDef = {
      cardId: 901,
      timing: 'support',
      ops: [
        { op: 'setSpecialty', target: 'self', to: 'Darkness' },
        { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
      ],
    };
    const effect902: CardEffectDef = {
      cardId: 902,
      timing: 'support',
      ops: [
        {
          op: 'if',
          cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
          then: [{ op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' }],
        },
      ],
    };
    const customRegistry: EffectRegistry = {
      901: effect901,
      902: effect902,
    };

    const opponentHpBefore = state.players.opponent.battleDigimon!.currentHp;
    const agumonCircle = getCardById(27)!.attacks!.circle.power;

    resolveBattle(state, customRegistry);

    expect(state.events.some((e) => e.type === 'supportVoided')).toBe(false);
    expect(state.battle!.supportCards.player?.voided).not.toBe(true);
    expect(
      state.events.some(
        (e) =>
          e.type === 'statModified' &&
          e.side === 'player' &&
          e.stat === 'specialty' &&
          e.newValue === 'Darkness'
      )
    ).toBe(true);
    // Also verify 901's +200 attack boost landed cleanly
    expect(state.players.opponent.battleDigimon!.currentHp).toBe(
      Math.max(0, opponentHpBefore - (agumonCircle + 200))
    );
  });

  it('6. Digivolve Options (#293-#300) are always usable in digivolve phase (discarded if no target) and never usable as Support', () => {
    let state = createMatch({
      playerDeck: buildTestDeck(),
      opponentDeck: buildTestDeck(),
      seed: 333,
      firstPlayer: 'player',
      config: { enableMulligan: false },
    });

    const agumon = getCardById(27)!;
    state.players.player.battleDigimon = {
      cardId: 27,
      stack: [],
      currentHp: agumon.hp,
      maxHp: agumon.hp,
      effectiveSpecialty: 'Fire',
    };
    state.players.player.dpSlot = [];
    state.players.player.dpTotal = 0;
    state.activePlayer = 'player';
    state.phase = 'digivolve';

    // Holding #299 Speed, #297 Warp, #298 De-Armor, #300 Digi-devolve with NO usable evolution/devolve target:
    // all Digivolve Options are still playable in the digivolve phase and are discarded to offline when played.
    state.players.player.hand = [299, 297, 298, 300];
    for (const [idx, optId] of [299, 297, 298, 300].entries()) {
      expect(
        canUseDigivolveOptionCard(state.players.player, optId, {
          handIndex: idx,
          alreadyAddedDp: false,
        })
      ).toBe(true);
      expect(
        getLegalActions(state, 'player').some(
          (a) => a.type === 'useDigivolveOption' && a.cardId === optId
        )
      ).toBe(true);
    }

    // Play #299 Speed Digivolve with no Champion/Ultimate in hand -> discarded to offline cleanly
    state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
    expect(state.players.player.offline).toContain(299);
    expect(state.players.player.hand).toEqual([297, 298, 300]);

    // Transition to supportSelect -> Digivolve Options (#293-#300) must NEVER appear as playSupportFromHand actions
    state.players.opponent.battleDigimon = {
      cardId: 62,
      stack: [],
      currentHp: getCardById(62)!.hp,
      maxHp: getCardById(62)!.hp,
      effectiveSpecialty: 'Ice',
    };
    state.phase = 'attackSelect';
    state.battle = {
      firstAttacker: 'player',
      defender: 'opponent',
      chosenAttacks: { player: null, opponent: null },
      effectiveAttacks: { player: null, opponent: null },
      supportCards: { player: null, opponent: null },
      supportDecided: { player: false, opponent: false },
      computedPowers: { player: 0, opponent: 0 },
    };
    state = applyAction(state, { type: 'chooseAttack', side: 'player', slot: 'circle' });
    state = applyAction(state, { type: 'chooseAttack', side: 'opponent', slot: 'circle' });
    expect(state.phase).toBe('supportSelect');

    const supportActions = getLegalActions(state, 'player');
    expect(supportActions.some((a) => a.type === 'playSupportFromHand')).toBe(false);
    expect(() =>
      applyAction(state, { type: 'playSupportFromHand', side: 'player', handIndex: 0 })
    ).toThrow();
  });

  it('7. enforces #299 Speed Digivolve notInAbnormal restriction against abnormal digivolve options (#296 Mutant, #297 Warp)', () => {
    let state = createMatch({
      playerDeck: buildTestDeck(),
      opponentDeck: buildTestDeck(),
      seed: 444,
      firstPlayer: 'player',
      config: { enableMulligan: false },
    });

    const agumon = getCardById(27)!;
    state.players.player.battleDigimon = {
      cardId: 27,
      stack: [],
      currentHp: agumon.hp,
      maxHp: agumon.hp,
      effectiveSpecialty: 'Fire',
    };
    state.activePlayer = 'player';
    state.phase = 'digivolve';

    // With 0 DP and [297 Warp, 299 Speed, 9 MetalGreymon U, 264 Attack Chip],
    // both Digivolve Options can be played/discarded individually,
    // but stacking #299 Speed onto #297 Warp is blocked by notInAbnormal so 0-DP MetalGreymon stays illegal.
    state.players.player.dpSlot = [];
    state.players.player.dpTotal = 0;
    state.players.player.hand = [297, 299, 9, 264];

    state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
    expect(state.players.player.activeDigivolveModifier?.allowSkipLevel).toBe(true);
    expect(state.players.player.offline).toContain(297);

    // #299 Speed is playable (and discarded), yet notInAbnormal forbids evolving into #009 MetalGreymon via Warp+Speed
    state = applyAction(state, { type: 'useDigivolveOption', side: 'player', handIndex: 0 });
    expect(state.players.player.offline).toContain(299);
    expect(state.players.player.activeDigivolveModifier?.notInAbnormal).toBe(true);
    expect(
      getLegalActions(state, 'player').some((a) => a.type === 'digivolve' && a.cardId === 9)
    ).toBe(false);
  });
});
