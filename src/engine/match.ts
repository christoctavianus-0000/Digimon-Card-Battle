/**
 * Core Match State Machine & EngineApi Implementation for Digimon Digital Card Battle (PS1).
 * Implements:
 * - validateDeck
 * - createMatch
 * - getLegalActions
 * - applyAction
 * - getVisibleState
 */

import { getCardById } from '../data/cards';
import { isBattleSupportOption, isDigivolvePhaseOption } from '../data/effects';
import type {
  Action,
  ActiveDigimon,
  AttackSlot,
  CardData,
  CardId,
  CreateMatchParams,
  EngineApi,
  MatchPhase,
  MatchState,
  PlayerSide,
  PlayerState,
  RulesConfig,
  VisibleBattleContext,
  VisibleMatchState,
  VisiblePlayerState,
} from '../types/game';
import {
  DECK_SIZE,
  HAND_SIZE,
  MAX_COPIES,
  MAX_PARTNER_COPIES,
} from '../types/game';
import { resolveBattle } from './battle';
import {
  computeDpTotal,
  createEffectExecContext,
  executeEffectOps,
  matchesLevelList,
  otherSide,
  resolveCardEffectDef,
} from './effectInterpreter';
import { randomInt, shuffle } from './rng';

export const MAX_TOTAL_PARTNERS = 3;
export const MAX_FORCED_MULLIGANS = 10;

/**
 * Canonical DDCB Partner ('R P') -> Armor ('A') digivolution lineage map (RULES.md Section 6.4).
 */
export const ARMOR_LINEAGE: Readonly<Record<CardId, readonly CardId[]>> = {
  175: [172, 173, 185], // Veemon -> Flamedramon, Magnamon, Raidramon
  182: [179, 188], // Hawkmon -> Halsemon, Shurimon
  183: [174, 180], // Patamon -> Baronmon, Pegasusmon
  184: [178, 181], // Gatomon -> Tylomon, Nefertimon
  187: [177, 186], // Wormmon -> Quetzalmon, Shadramon
  190: [176, 189], // Armadillomon -> Submarimon, Digmon
};

/**
 * Checks whether a card is a playable Rookie ('R' or 'R P').
 */
export function isRookieCard(cardId: CardId): boolean {
  const card = getCardById(cardId);
  return Boolean(card && card.kind === 'Digimon' && (card.level === 'R' || card.level === 'R P'));
}

/**
 * Checks whether a player's hand contains at least one playable Rookie ('R' or 'R P').
 */
export function handHasRookie(hand: readonly CardId[]): boolean {
  return hand.some((id) => isRookieCard(id));
}

/**
 * Validates a 30-card deck according to RULES.md Section 1.
 */
export function validateDeck(
  cards: readonly CardId[],
  config?: RulesConfig,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cards.length !== DECK_SIZE) {
    errors.push(`Deck must contain exactly ${DECK_SIZE} cards (got ${cards.length}).`);
  }

  const counts = new Map<CardId, number>();
  let totalPartnerRookies = 0;
  let rookieCount = 0;

  for (const id of cards) {
    const card = getCardById(id);
    if (!card) {
      errors.push(`Invalid card ID: ${id}.`);
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (card.level === 'R' || card.level === 'R P') {
      rookieCount += 1;
    }
    if (card.level === 'R P') {
      totalPartnerRookies += 1;
    }
  }

  const allowPartners = config?.allowPartnerCards ?? true;

  for (const [id, count] of counts.entries()) {
    const card = getCardById(id);
    if (!card) continue;

    if (!allowPartners && (card.level === 'R P' || card.level === 'A' || card.isPartner)) {
      errors.push(`Partner/Armor card "${card.name}" (#${card.no}) is not allowed by configuration.`);
    }

    if (card.level === 'R P') {
      if (count > MAX_PARTNER_COPIES) {
        errors.push(
          `Partner card "${card.name}" (#${card.no}) exceeds max copies of ${MAX_PARTNER_COPIES} (got ${count}).`,
        );
      }
    } else if (count > MAX_COPIES) {
      errors.push(
        `Card "${card.name}" (#${card.no}) exceeds max copies of ${MAX_COPIES} (got ${count}).`,
      );
    }
  }

  if (totalPartnerRookies > MAX_TOTAL_PARTNERS) {
    errors.push(
      `Deck may contain at most ${MAX_TOTAL_PARTNERS} Partner Rookie ('R P') cards (got ${totalPartnerRookies}).`,
    );
  }

  if (rookieCount === 0) {
    errors.push('Deck must contain at least 1 Rookie (Level R or R P) Digimon card.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Deep-clones a `MatchState` so `applyAction` never mutates the caller's state reference.
 */
export function cloneMatchState(state: MatchState): MatchState {
  return structuredClone(state);
}

/**
 * Determines who the Turn Player (first preparation & default first attacker) is for `state.turnNumber`.
 */
export function getTurnStarter(state: MatchState): PlayerSide {
  const startEv = state.events.find((e) => e.type === 'matchStarted');
  const firstPlayer: PlayerSide =
    startEv && startEv.type === 'matchStarted' ? startEv.firstPlayer : 'player';
  return state.turnNumber % 2 === 1 ? firstPlayer : otherSide(firstPlayer);
}

/**
 * Returns the index of the last `turnEnd` phase change in `state.events`, or -1 if still on Turn 1.
 */
function getLastTurnEndEventIndex(state: MatchState): number {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i]!;
    if (ev.type === 'phaseChanged' && ev.phase === 'turnEnd') {
      return i;
    }
  }
  return -1;
}

/**
 * Checks whether `side` has already placed a Digimon card into `dpSlot` during the current turn's preparation.
 */
export function hasAddedDpThisTurn(state: MatchState, side: PlayerSide): boolean {
  const startIdx = getLastTurnEndEventIndex(state) + 1;
  for (let i = startIdx; i < state.events.length; i++) {
    const ev = state.events[i]!;
    if (ev.type === 'dpCardAdded' && ev.side === side) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether `side` has already entered or completed their `digivolve` phase this turn.
 */
function hasSideEnteredDigivolveThisTurn(state: MatchState, side: PlayerSide): boolean {
  const startIdx = getLastTurnEndEventIndex(state) + 1;
  for (let i = startIdx; i < state.events.length; i++) {
    const ev = state.events[i]!;
    if (
      ev.type === 'phaseChanged' &&
      ev.phase === 'digivolve' &&
      ev.turnNumber === state.turnNumber &&
      ev.activePlayer === side
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether `player` can digivolve their active Digimon into `toCard` using normal or Option-modified rules.
 */
export function canNormalOrOptionDigivolve(player: PlayerState, toCard: CardData): boolean {
  const active = player.battleDigimon;
  if (!active) return false;
  if (toCard.kind !== 'Digimon' || !toCard.level) return false;
  // Level 'A' is Armor Digivolution unless ignoreLevel is active
  const mod = player.activeDigivolveModifier;
  if (toCard.level === 'A' && !mod?.ignoreLevel) return false;

  const fromCard = getCardById(active.cardId);
  if (!fromCard || fromCard.kind !== 'Digimon' || !fromCard.level) return false;

  // 1. Level check
  let levelOk = false;
  if (mod?.ignoreLevel) {
    levelOk = true;
  } else if (mod?.requireFromLevels || mod?.allowedToLevels) {
    const fromOk = mod.requireFromLevels
      ? matchesLevelList(fromCard.level, mod.requireFromLevels)
      : true;
    const toOk = mod.allowedToLevels
      ? matchesLevelList(toCard.level, mod.allowedToLevels)
      : true;
    levelOk = fromOk && toOk;
  } else if (mod?.allowSkipLevel) {
    levelOk =
      ((fromCard.level === 'R' || fromCard.level === 'R P') &&
        (toCard.level === 'C' || toCard.level === 'U')) ||
      (fromCard.level === 'C' && toCard.level === 'U');
  } else if (mod?.allowSameLevel) {
    levelOk =
      matchesLevelList(toCard.level, [fromCard.level]) ||
      ((fromCard.level === 'R' || fromCard.level === 'R P') && toCard.level === 'C') ||
      (fromCard.level === 'C' && toCard.level === 'U');
  } else {
    levelOk =
      ((fromCard.level === 'R' || fromCard.level === 'R P') && toCard.level === 'C') ||
      (fromCard.level === 'C' && toCard.level === 'U');
  }

  if (!levelOk) return false;

  // 2. Specialty check
  if (!mod?.ignoreSpecialty) {
    if (toCard.specialty !== active.effectiveSpecialty) {
      return false;
    }
  }

  // 3. DP requirement check
  if (!mod?.ignoreDp) {
    const availableDp = player.dpTotal + (mod?.extraDp ?? 0);
    if (availableDp < toCard.dp) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether `player` can Armor Digivolve their active Partner Rookie ('R P') into `toCard` ('A').
 */
export function canArmorDigivolve(player: PlayerState, toCard: CardData): boolean {
  const active = player.battleDigimon;
  if (!active) return false;
  if (toCard.kind !== 'Digimon' || toCard.level !== 'A') return false;

  const fromCard = getCardById(active.cardId);
  if (!fromCard || fromCard.level !== 'R P') return false;

  const lineage = ARMOR_LINEAGE[fromCard.id];
  if (!lineage) return false;
  return lineage.includes(toCard.id);
}

/**
 * Checks whether a Digivolve-phase Option card (`293`..`300`) can currently be used by `player`.
 */
export function canUseDigivolveOptionCard(player: PlayerState, optionCardId: CardId): boolean {
  if (!isDigivolvePhaseOption(optionCardId)) return false;
  const active = player.battleDigimon;
  if (!active) return false;
  const activeCard = getCardById(active.cardId);
  if (!activeCard) return false;

  switch (optionCardId) {
    case 294: // ArmorCrush Digivolve: requires active Level A
      return activeCard.level === 'A';
    case 297: // Warp Digivolve: requires active Level R or R P
      return activeCard.level === 'R' || activeCard.level === 'R P';
    case 298: {
      // De-Armor Digivolve: requires active Level A with an underlying R / R P card
      if (activeCard.level !== 'A' || active.stack.length === 0) return false;
      const underCard = getCardById(active.stack[active.stack.length - 1]!);
      return Boolean(underCard && (underCard.level === 'R' || underCard.level === 'R P'));
    }
    case 300: // Digi-devolve: requires a digivolved stack (at least 1 card underneath)
      return active.stack.length >= 1;
    default:
      // 293 Download, 295 Special, 296 Mutant, 299 Speed
      return true;
  }
}

/**
 * Executes a player's Draw Phase (drawing up to 4 cards) and transitions to
 * either `'rookiePlacement'` (if `battleDigimon === null`) or `'digivolve'`.
 * Handles Deck-Out and Post-KO Rookie Dry-Hand redraw rules per RULES.md Section 8.
 */
function runPlayerPreparationStart(state: MatchState, side: PlayerSide): void {
  state.activePlayer = side;
  state.phase = 'draw';
  state.events.push({
    type: 'phaseChanged',
    phase: 'draw',
    activePlayer: side,
    turnNumber: state.turnNumber,
  });

  const player = state.players[side];
  const needed = Math.max(0, HAND_SIZE - player.hand.length);

  // Deck-Out check: if online deck is empty at start of Draw Phase or has fewer cards than needed
  if (player.online.length === 0 || (needed > 0 && player.online.length < needed)) {
    const drawn = player.online.splice(0, player.online.length);
    if (drawn.length > 0) {
      player.hand.push(...drawn);
      state.events.push({
        type: 'cardsDrawn',
        side,
        cardIds: drawn,
        count: drawn.length,
      });
    }
    const winner = otherSide(side);
    state.winner = winner;
    state.winReason = 'opponent_deck_out';
    state.phase = 'gameOver';
    state.events.push({
      type: 'gameOver',
      winner,
      reason: 'opponent_deck_out',
    });
    return;
  }

  if (needed > 0) {
    const drawn = player.online.splice(0, needed);
    player.hand.push(...drawn);
    state.events.push({
      type: 'cardsDrawn',
      side,
      cardIds: drawn,
      count: drawn.length,
    });
    state.events.push({
      type: 'cardsMoved',
      side,
      from: 'online',
      to: 'hand',
      cardIds: drawn,
      count: drawn.length,
    });
  }

  // Check if player needs to place a new Rookie after being KO'd last turn
  if (player.battleDigimon === null) {
    // Forced Hand Redraw (Rookie Dry-Hand Rule, RULES.md Section 8.1.4):
    // If no R / R P in hand, discard hand to offline and draw 4 from online until a Rookie is drawn or deck runs out.
    while (!handHasRookie(player.hand)) {
      if (player.hand.length > 0) {
        const discarded = player.hand.splice(0, player.hand.length);
        player.offline.push(...discarded);
        state.events.push({
          type: 'cardsMoved',
          side,
          from: 'hand',
          to: 'offline',
          cardIds: discarded,
          count: discarded.length,
        });
      }

      if (player.online.length < HAND_SIZE) {
        const lastCards = player.online.splice(0, player.online.length);
        if (lastCards.length > 0) {
          player.hand.push(...lastCards);
          state.events.push({
            type: 'cardsDrawn',
            side,
            cardIds: lastCards,
            count: lastCards.length,
          });
        }
        if (!handHasRookie(player.hand)) {
          const winner = otherSide(side);
          state.winner = winner;
          state.winReason = 'opponent_deck_out';
          state.phase = 'gameOver';
          state.events.push({
            type: 'gameOver',
            winner,
            reason: 'opponent_deck_out',
          });
          return;
        }
        break;
      }

      const redrawn = player.online.splice(0, HAND_SIZE);
      player.hand.push(...redrawn);
      state.events.push({
        type: 'cardsDrawn',
        side,
        cardIds: redrawn,
        count: redrawn.length,
      });
      state.events.push({
        type: 'cardsMoved',
        side,
        from: 'online',
        to: 'hand',
        cardIds: redrawn,
        count: redrawn.length,
      });
    }

    state.phase = 'rookiePlacement';
    state.events.push({
      type: 'phaseChanged',
      phase: 'rookiePlacement',
      activePlayer: side,
      turnNumber: state.turnNumber,
    });
    return;
  }

  // Otherwise transition directly to Digivolve phase
  state.phase = 'digivolve';
  state.events.push({
    type: 'phaseChanged',
    phase: 'digivolve',
    activePlayer: side,
    turnNumber: state.turnNumber,
  });
}

/**
 * Performs initial forced mulligan redraws if a player's starting 4-card hand has no Rookie.
 * Returns false if the player has no Rookies after MAX_FORCED_MULLIGANS attempts (match lost).
 */
function ensureHandHasRookieOnSetup(state: MatchState, side: PlayerSide): boolean {
  const player = state.players[side];
  let attempts = 0;
  while (!handHasRookie(player.hand) && attempts < MAX_FORCED_MULLIGANS) {
    attempts += 1;
    player.online.push(...player.hand.splice(0, player.hand.length));
    player.online = shuffle(player.online, state);
    const drawn = player.online.splice(0, Math.min(HAND_SIZE, player.online.length));
    player.hand.push(...drawn);
  }
  return handHasRookie(player.hand);
}

/**
 * Creates a new match state and runs initial shuffle & 4-card draw.
 */
export function createMatch(params: CreateMatchParams): MatchState {
  const seed = (params.seed ?? Date.now()) >>> 0;
  const rngCarrier = { rngSeed: seed };

  const firstPlayer: PlayerSide =
    params.firstPlayer ?? (randomInt(rngCarrier, 2) === 0 ? 'player' : 'opponent');

  const config: RulesConfig = {
    unspecifiedSelection: params.config?.unspecifiedSelection ?? 'random',
    allowPartnerCards: params.config?.allowPartnerCards ?? true,
    enableMulligan: params.config?.enableMulligan ?? true,
  };

  const playerOnline = shuffle(params.playerDeck, rngCarrier);
  const opponentOnline = shuffle(params.opponentDeck, rngCarrier);

  const playerHand = playerOnline.splice(0, Math.min(HAND_SIZE, playerOnline.length));
  const opponentHand = opponentOnline.splice(0, Math.min(HAND_SIZE, opponentOnline.length));

  const state: MatchState = {
    players: {
      player: {
        online: playerOnline,
        hand: playerHand,
        battleDigimon: null,
        dpSlot: [],
        dpTotal: 0,
        offline: [],
        koCount: 0,
        activeDigivolveModifier: null,
      },
      opponent: {
        online: opponentOnline,
        hand: opponentHand,
        battleDigimon: null,
        dpSlot: [],
        dpTotal: 0,
        offline: [],
        koCount: 0,
        activeDigivolveModifier: null,
      },
    },
    turnNumber: 1,
    activePlayer: firstPlayer,
    phase: 'mulligan',
    mulliganDecided: { player: false, opponent: false },
    battle: null,
    winner: null,
    events: [
      {
        type: 'matchStarted',
        firstPlayer,
        seed,
      },
      {
        type: 'cardsDrawn',
        side: 'player',
        cardIds: [...playerHand],
        count: playerHand.length,
      },
      {
        type: 'cardsDrawn',
        side: 'opponent',
        cardIds: [...opponentHand],
        count: opponentHand.length,
      },
    ],
    rngSeed: rngCarrier.rngSeed,
    config,
  };

  // Ensure starting hands have at least 1 Rookie (auto-redraw if needed)
  for (const side of ['player', 'opponent'] as const) {
    if (!ensureHandHasRookieOnSetup(state, side)) {
      const winner = otherSide(side);
      state.winner = winner;
      state.winReason = 'opponent_no_rookie';
      state.phase = 'gameOver';
      state.events.push({
        type: 'gameOver',
        winner,
        reason: 'opponent_no_rookie',
      });
      return state;
    }
  }

  if (config.enableMulligan === false) {
    state.mulliganDecided = { player: true, opponent: true };
    state.phase = 'rookiePlacement';
    state.events.push({
      type: 'phaseChanged',
      phase: 'rookiePlacement',
      activePlayer: firstPlayer,
      turnNumber: 1,
    });
  } else {
    state.phase = 'mulligan';
    state.events.push({
      type: 'phaseChanged',
      phase: 'mulligan',
      activePlayer: firstPlayer,
      turnNumber: 1,
    });
  }

  return state;
}

/**
 * Returns all legal actions for `side` in the current `state`.
 */
export function getLegalActions(state: MatchState, side: PlayerSide): Action[] {
  if (state.phase === 'gameOver' || state.winner !== null) {
    return [];
  }

  const player = state.players[side];

  switch (state.phase) {
    case 'mulligan': {
      const decided = state.mulliganDecided?.[side] ?? false;
      if (decided) return [];
      return [
        { type: 'mulligan', side, keep: true },
        { type: 'mulligan', side, keep: false },
      ];
    }

    case 'rookiePlacement': {
      if (player.battleDigimon !== null) return [];
      // During mid-match post-KO placement, only activePlayer places a Rookie.
      // During initial setup, both players have battleDigimon === null; allow either side that needs to place.
      const actions: Action[] = [];
      for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]!;
        if (isRookieCard(cardId)) {
          actions.push({
            type: 'placeRookie',
            side,
            handIndex: i,
            cardId,
          });
        }
      }
      return actions;
    }

    case 'digivolve': {
      if (state.activePlayer !== side) return [];
      const actions: Action[] = [];

      // 1. Add a Digimon card from hand to DP Slot (at most once per turn)
      if (!hasAddedDpThisTurn(state, side)) {
        for (let i = 0; i < player.hand.length; i++) {
          const cardId = player.hand[i]!;
          const card = getCardById(cardId);
          // Only Digimon cards with plusP > 0 (or kind === 'Digimon' & level !== 'A') can be placed into DP Slot
          if (card && card.kind === 'Digimon' && card.level !== 'A') {
            actions.push({
              type: 'addToDp',
              side,
              handIndex: i,
              cardId,
            });
          }
        }
      }

      // 2. Play Digivolve-phase Option cards (293..300)
      for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]!;
        if (canUseDigivolveOptionCard(player, cardId)) {
          actions.push({
            type: 'useDigivolveOption',
            side,
            handIndex: i,
            cardId,
          });
        }
      }

      // 3. Normal / Option-modified Digivolve and Armor Digivolve
      for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]!;
        const card = getCardById(cardId);
        if (!card || card.kind !== 'Digimon') continue;

        if (canArmorDigivolve(player, card)) {
          actions.push({
            type: 'armorDigivolve',
            side,
            handIndex: i,
            cardId,
          });
        } else if (canNormalOrOptionDigivolve(player, card)) {
          actions.push({
            type: 'digivolve',
            side,
            handIndex: i,
            cardId,
          });
        }
      }

      // 4. End Digivolve Phase
      actions.push({ type: 'endDigivolvePhase', side });
      return actions;
    }

    case 'attackSelect': {
      if (!state.battle) return [];
      if (state.battle.chosenAttacks[side] !== null) return [];
      if (!player.battleDigimon) return [];
      const slots: AttackSlot[] = ['circle', 'triangle', 'x'];
      return slots.map((slot) => ({
        type: 'chooseAttack',
        side,
        slot,
      }));
    }

    case 'supportSelect': {
      if (!state.battle) return [];
      const decided = state.battle.supportDecided?.[side] ?? false;
      if (decided) return [];

      const actions: Action[] = [];
      for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]!;
        const card = getCardById(cardId);
        if (!card) continue;
        // Digimon cards (000..190) and Battle Support Option cards (191..292) can be played in Support Slot
        if (card.kind === 'Digimon' || isBattleSupportOption(cardId)) {
          actions.push({
            type: 'playSupportFromHand',
            side,
            handIndex: i,
            cardId,
          });
        }
      }

      if (player.online.length > 0) {
        actions.push({
          type: 'playSupportFromDeckTop',
          side,
        });
      }

      actions.push({
        type: 'passSupport',
        side,
      });

      return actions;
    }

    default:
      return [];
  }
}

/**
 * Helper to execute digivolution of `player.battleDigimon` using the card at `handIndex`.
 */
function performDigivolveFromHand(
  state: MatchState,
  side: PlayerSide,
  handIndex: number,
  isArmor: boolean,
): void {
  const player = state.players[side];
  const active = player.battleDigimon;
  if (!active) {
    throw new Error(`Cannot digivolve: ${side} has no active Digimon.`);
  }
  const cardId = player.hand[handIndex];
  if (cardId === undefined) {
    throw new Error(`Invalid handIndex ${handIndex} for digivolve.`);
  }
  const toCard = getCardById(cardId);
  if (!toCard || toCard.kind !== 'Digimon') {
    throw new Error(`Card ${cardId} is not a Digimon card.`);
  }

  if (isArmor) {
    if (!canArmorDigivolve(player, toCard)) {
      throw new Error(`Illegal Armor Digivolution from ${active.cardId} to ${toCard.id}.`);
    }
    player.hand.splice(handIndex, 1);
    const fromCardId = active.cardId;
    active.stack.push(fromCardId);
    active.cardId = toCard.id;
    active.maxHp = toCard.hp;
    active.currentHp = toCard.hp;
    active.effectiveSpecialty = toCard.specialty ?? active.effectiveSpecialty;
    // Armor Digivolve costs 0 DP and keeps dpSlot intact!
    state.events.push({
      type: 'digivolved',
      side,
      fromCardId,
      toCardId: toCard.id,
      hp: active.currentHp,
      method: 'armor',
    });
    return;
  }

  if (!canNormalOrOptionDigivolve(player, toCard)) {
    throw new Error(`Illegal Digivolution from ${active.cardId} to ${toCard.id}.`);
  }

  const mod = player.activeDigivolveModifier;
  const ignoreDp = Boolean(mod?.ignoreDp);
  const usedOptionMod = Boolean(mod);

  player.hand.splice(handIndex, 1);
  const fromCardId = active.cardId;
  active.stack.push(fromCardId);
  active.cardId = toCard.id;
  active.maxHp = toCard.hp;
  active.currentHp = toCard.hp;
  active.effectiveSpecialty = toCard.specialty ?? active.effectiveSpecialty;

  // Consume DP Slot unless ignoreDp is true (Speed Digivolve / Download Digivolve)
  if (!ignoreDp && player.dpSlot.length > 0) {
    const consumedDp = player.dpSlot.splice(0, player.dpSlot.length);
    player.dpTotal = 0;
    player.offline.push(...consumedDp);
    state.events.push({
      type: 'cardsMoved',
      side,
      from: 'dpSlot',
      to: 'offline',
      cardIds: consumedDp,
      count: consumedDp.length,
    });
  }

  player.activeDigivolveModifier = null;

  state.events.push({
    type: 'digivolved',
    side,
    fromCardId,
    toCardId: toCard.id,
    hp: active.currentHp,
    method: usedOptionMod ? 'option' : 'normal',
  });
}

/**
 * Applies a player or AI `Action` and returns the new `MatchState`, automatically advancing
 * non-interactive phases (`draw`, `battleResolve`, `turnEnd`).
 */
export function applyAction( currentState: MatchState, action: Action): MatchState {
  if (currentState.phase === 'gameOver' || currentState.winner !== null) {
    throw new Error('Cannot apply action: match is already over.');
  }

  const state = cloneMatchState(currentState);
  const { side } = action;
  const player = state.players[side];

  switch (action.type) {
    case 'mulligan': {
      if (state.phase !== 'mulligan') {
        throw new Error(`Action 'mulligan' not allowed in phase '${state.phase}'.`);
      }
      state.mulliganDecided = state.mulliganDecided ?? { player: false, opponent: false };
      if (state.mulliganDecided[side]) {
        throw new Error(`Side '${side}' has already decided mulligan.`);
      }

      if (!action.keep) {
        // Return hand to online deck, shuffle, and draw 4 new cards
        const returned = player.hand.splice(0, player.hand.length);
        player.online.push(...returned);
        player.online = shuffle(player.online, state);
        const drawn = player.online.splice(0, Math.min(HAND_SIZE, player.online.length));
        player.hand.push(...drawn);
        ensureHandHasRookieOnSetup(state, side);
        state.events.push({
          type: 'cardsDrawn',
          side,
          cardIds: [...player.hand],
          count: player.hand.length,
        });
      }

      state.mulliganDecided[side] = true;
      state.events.push({
        type: 'mulligan',
        side,
        kept: action.keep,
      });

      const oppSide = otherSide(side);
      if (!state.mulliganDecided[oppSide]) {
        state.activePlayer = oppSide;
      } else {
        // Both sides have completed mulligan -> move to initial rookiePlacement
        const firstPlayer = getTurnStarter(state);
        state.activePlayer = firstPlayer;
        state.phase = 'rookiePlacement';
        state.events.push({
          type: 'phaseChanged',
          phase: 'rookiePlacement',
          activePlayer: firstPlayer,
          turnNumber: state.turnNumber,
        });
      }
      return state;
    }

    case 'placeRookie': {
      if (state.phase !== 'rookiePlacement') {
        throw new Error(`Action 'placeRookie' not allowed in phase '${state.phase}'.`);
      }
      if (player.battleDigimon !== null) {
        throw new Error(`Side '${side}' already has an active Digimon in the Battle Slot.`);
      }

      const cardId = player.hand[action.handIndex];
      if (cardId === undefined || !isRookieCard(cardId)) {
        throw new Error(`Invalid Rookie card at handIndex ${action.handIndex}.`);
      }
      const card = getCardById(cardId)!;

      player.hand.splice(action.handIndex, 1);
      const activeDigimon: ActiveDigimon = {
        cardId: card.id,
        stack: [],
        currentHp: card.hp,
        maxHp: card.hp,
        effectiveSpecialty: card.specialty ?? 'Fire',
      };
      player.battleDigimon = activeDigimon;

      state.events.push({
        type: 'rookiePlaced',
        side,
        cardId: card.id,
        hp: card.hp,
      });

      const oppSide = otherSide(side);
      if (state.players[oppSide].battleDigimon === null) {
        // Initial setup: the other player still needs to place their starting Rookie
        state.activePlayer = oppSide;
        return state;
      }

      // Check if we are in Turn 1 initial setup (before Turn 1 Draw/Digivolve has occurred)
      const turnStarter = getTurnStarter(state);
      if (
        state.turnNumber === 1 &&
        !hasSideEnteredDigivolveThisTurn(state, turnStarter) &&
        !hasSideEnteredDigivolveThisTurn(state, otherSide(turnStarter))
      ) {
        // Both players have placed their initial Rookies -> start Turn 1 Preparation for turnStarter
        runPlayerPreparationStart(state, turnStarter);
        return state;
      }

      // Otherwise this was a post-KO Rookie placement during `side`'s Preparation Phase -> enter digivolve
      state.activePlayer = side;
      state.phase = 'digivolve';
      state.events.push({
        type: 'phaseChanged',
        phase: 'digivolve',
        activePlayer: side,
        turnNumber: state.turnNumber,
      });
      return state;
    }

    case 'addToDp': {
      if (state.phase !== 'digivolve' || state.activePlayer !== side) {
        throw new Error(`Action 'addToDp' not allowed for '${side}' in phase '${state.phase}'.`);
      }
      if (hasAddedDpThisTurn(state, side)) {
        throw new Error(`Side '${side}' has already added a card to the DP Slot this turn.`);
      }

      const cardId = player.hand[action.handIndex];
      if (cardId === undefined) {
        throw new Error(`Invalid handIndex ${action.handIndex} for addToDp.`);
      }
      const card = getCardById(cardId);
      if (!card || card.kind !== 'Digimon' || card.level === 'A') {
        throw new Error(`Card ${cardId} cannot be placed in the DP Slot.`);
      }

      player.hand.splice(action.handIndex, 1);
      player.dpSlot.push(card.id);
      player.dpTotal = computeDpTotal(player.dpSlot);

      state.events.push({
        type: 'dpCardAdded',
        side,
        cardId: card.id,
        plusP: card.plusP,
        newDpTotal: player.dpTotal,
      });
      state.events.push({
        type: 'cardsMoved',
        side,
        from: 'hand',
        to: 'dpSlot',
        cardIds: [card.id],
        count: 1,
      });
      return state;
    }

    case 'useDigivolveOption': {
      if (state.phase !== 'digivolve' || state.activePlayer !== side) {
        throw new Error(
          `Action 'useDigivolveOption' not allowed for '${side}' in phase '${state.phase}'.`,
        );
      }

      const cardId = player.hand[action.handIndex];
      if (cardId === undefined || !canUseDigivolveOptionCard(player, cardId)) {
        throw new Error(`Cannot use Digivolve Option card at handIndex ${action.handIndex}.`);
      }

      const optionCard = getCardById(cardId)!;
      const effectDef = resolveCardEffectDef(cardId);
      if (!effectDef) {
        throw new Error(`Missing effect definition for Digivolve Option card ${cardId}.`);
      }

      // Remove Option card from hand and discard to offline after execution
      player.hand.splice(action.handIndex, 1);
      player.offline.push(cardId);

      state.events.push({
        type: 'digivolveOptionUsed',
        side,
        cardId,
        description: optionCard.supportText,
      });
      state.events.push({
        type: 'cardsMoved',
        side,
        from: 'hand',
        to: 'offline',
        cardIds: [cardId],
        count: 1,
      });

      const ctx = createEffectExecContext(state, side, { sourceCardId: cardId });
      executeEffectOps(effectDef.ops, ctx);

      // If caller also provided `targetHandIndex`, perform the digivolution in one step
      if (action.targetHandIndex !== undefined) {
        const adjustedIdx =
          action.targetHandIndex > action.handIndex
            ? action.targetHandIndex - 1
            : action.targetHandIndex;
        performDigivolveFromHand(state, side, adjustedIdx, false);
      }

      return state;
    }

    case 'digivolve': {
      if (state.phase !== 'digivolve' || state.activePlayer !== side) {
        throw new Error(`Action 'digivolve' not allowed for '${side}' in phase '${state.phase}'.`);
      }
      performDigivolveFromHand(state, side, action.handIndex, false);
      return state;
    }

    case 'armorDigivolve': {
      if (state.phase !== 'digivolve' || state.activePlayer !== side) {
        throw new Error(
          `Action 'armorDigivolve' not allowed for '${side}' in phase '${state.phase}'.`,
        );
      }
      performDigivolveFromHand(state, side, action.handIndex, true);
      return state;
    }

    case 'endDigivolvePhase': {
      if (state.phase !== 'digivolve' || state.activePlayer !== side) {
        throw new Error(
          `Action 'endDigivolvePhase' not allowed for '${side}' in phase '${state.phase}'.`,
        );
      }
      player.activeDigivolveModifier = null;

      const oppSide = otherSide(side);
      // Record that `side` had their digivolve phase if not already in events (for synthetic test states)
      if (!hasSideEnteredDigivolveThisTurn(state, side)) {
        state.events.push({
          type: 'phaseChanged',
          phase: 'digivolve',
          activePlayer: side,
          turnNumber: state.turnNumber,
        });
      }

      // If the other player has not yet had their Preparation Phase this turn, run theirs now!
      if (!hasSideEnteredDigivolveThisTurn(state, oppSide)) {
        runPlayerPreparationStart(state, oppSide);
        return state;
      }

      // Both players have finished Preparation Phase -> enter Shared Battle Phase (attackSelect)
      const turnStarter = getTurnStarter(state);
      const defender = otherSide(turnStarter);
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

      state.events.push({
        type: 'phaseChanged',
        phase: 'attackSelect',
        activePlayer: turnStarter,
        turnNumber: state.turnNumber,
      });
      return state;
    }

    case 'chooseAttack': {
      if (state.phase !== 'attackSelect' || !state.battle) {
        throw new Error(`Action 'chooseAttack' not allowed in phase '${state.phase}'.`);
      }
      if (state.battle.chosenAttacks[side] !== null) {
        throw new Error(`Side '${side}' has already chosen an attack.`);
      }

      state.battle.chosenAttacks[side] = action.slot;
      state.battle.effectiveAttacks = state.battle.effectiveAttacks ?? {
        player: null,
        opponent: null,
      };
      state.battle.effectiveAttacks[side] = action.slot;

      const active = player.battleDigimon;
      const card = active ? getCardById(active.cardId) : undefined;
      state.battle.computedPowers[side] = card?.attacks?.[action.slot]?.power ?? 0;

      state.events.push({
        type: 'attackChosen',
        side,
        slot: action.slot,
      });

      const oppSide = otherSide(side);
      if (state.battle.chosenAttacks[oppSide] === null) {
        state.activePlayer = oppSide;
        return state;
      }

      // Both sides have chosen their attacks -> move to supportSelect
      const turnStarter = state.battle.firstAttacker;
      state.activePlayer = turnStarter;
      state.phase = 'supportSelect';
      state.battle.supportDecided = { player: false, opponent: false };
      state.events.push({
        type: 'phaseChanged',
        phase: 'supportSelect',
        activePlayer: turnStarter,
        turnNumber: state.turnNumber,
      });
      return state;
    }

    case 'playSupportFromHand':
    case 'playSupportFromDeckTop':
    case 'passSupport': {
      if (state.phase !== 'supportSelect' || !state.battle) {
        throw new Error(`Action '${action.type}' not allowed in phase '${state.phase}'.`);
      }
      state.battle.supportDecided = state.battle.supportDecided ?? {
        player: false,
        opponent: false,
      };
      if (state.battle.supportDecided[side]) {
        throw new Error(`Side '${side}' has already decided support this battle.`);
      }

      if (action.type === 'playSupportFromHand') {
        const cardId = player.hand[action.handIndex];
        if (cardId === undefined) {
          throw new Error(`Invalid handIndex ${action.handIndex} for playSupportFromHand.`);
        }
        const card = getCardById(cardId);
        if (!card || (card.kind !== 'Digimon' && !isBattleSupportOption(cardId))) {
          throw new Error(`Card ${cardId} cannot be played from hand as Battle Support.`);
        }
        player.hand.splice(action.handIndex, 1);
        state.battle.supportCards[side] = {
          cardId,
          source: 'hand',
        };
        state.events.push({
          type: 'supportPlayed',
          side,
          cardId,
          source: 'hand',
        });
      } else if (action.type === 'playSupportFromDeckTop') {
        if (player.online.length === 0) {
          throw new Error(`Cannot play support from deck top: '${side}' Online Deck is empty.`);
        }
        const cardId = player.online.shift()!;
        state.battle.supportCards[side] = {
          cardId,
          source: 'deckTop',
        };
        state.events.push({
          type: 'supportPlayed',
          side,
          cardId,
          source: 'deckTop',
        });
      } else {
        state.battle.supportCards[side] = null;
        state.events.push({
          type: 'supportPassed',
          side,
        });
      }

      state.battle.supportDecided[side] = true;

      const oppSide = otherSide(side);
      if (!state.battle.supportDecided[oppSide]) {
        state.activePlayer = oppSide;
        return state;
      }

      // Both players have decided their support -> resolve battle!
      const turnStarter = state.battle.firstAttacker;
      state.activePlayer = turnStarter;
      state.phase = 'battleResolve';
      state.events.push({
        type: 'phaseChanged',
        phase: 'battleResolve',
        activePlayer: turnStarter,
        turnNumber: state.turnNumber,
      });

      resolveBattle(state);

      if ((state.phase as MatchPhase) === 'gameOver' || state.winner !== null) {
        return state;
      }

      // Post-battle turn end & handover to next turn
      state.phase = 'turnEnd';
      state.events.push({
        type: 'phaseChanged',
        phase: 'turnEnd',
        activePlayer: turnStarter,
        turnNumber: state.turnNumber,
      });
      state.battle = null;

      state.turnNumber += 1;
      const nextTurnStarter = otherSide(turnStarter);
      state.activePlayer = nextTurnStarter;
      runPlayerPreparationStart(state, nextTurnStarter);
      return state;
    }
  }
}

/**
 * Projects a `MatchState` into a `VisibleMatchState` for `viewer`, hiding the opponent's
 * hand contents, Online Deck ordering, and unrevealed attack selection.
 */
export function getVisibleState(state: MatchState, viewer: PlayerSide): VisibleMatchState {
  const makeVisiblePlayer = (side: PlayerSide): VisiblePlayerState => {
    const p = state.players[side];
    const isViewer = side === viewer;
    return {
      onlineCount: p.online.length,
      handCount: p.hand.length,
      hand: isViewer ? [...p.hand] : [],
      battleDigimon: p.battleDigimon ? structuredClone(p.battleDigimon) : null,
      dpSlot: [...p.dpSlot],
      dpTotal: p.dpTotal,
      offline: [...p.offline],
      koCount: p.koCount,
      activeDigivolveModifier: p.activeDigivolveModifier
        ? structuredClone(p.activeDigivolveModifier)
        : null,
    };
  };

  let visibleBattle: VisibleBattleContext | null = null;
  if (state.battle) {
    const bothAttacksChosen =
      state.battle.chosenAttacks.player !== null && state.battle.chosenAttacks.opponent !== null;
    const other = otherSide(viewer);
    const otherChosen = state.battle.chosenAttacks[other];

    visibleBattle = {
      firstAttacker: state.battle.firstAttacker,
      defender: state.battle.defender,
      chosenAttacks: {
        player:
          viewer === 'player'
            ? state.battle.chosenAttacks.player
            : otherChosen === null
              ? null
              : bothAttacksChosen
                ? otherChosen
                : 'hidden',
        opponent:
          viewer === 'opponent'
            ? state.battle.chosenAttacks.opponent
            : otherChosen === null
              ? null
              : bothAttacksChosen
                ? otherChosen
                : 'hidden',
      },
      effectiveAttacks: state.battle.effectiveAttacks
        ? { ...state.battle.effectiveAttacks }
        : undefined,
      supportCards: {
        player: state.battle.supportCards.player
          ? { ...state.battle.supportCards.player }
          : null,
        opponent: state.battle.supportCards.opponent
          ? { ...state.battle.supportCards.opponent }
          : null,
      },
      supportDecided: state.battle.supportDecided
        ? { ...state.battle.supportDecided }
        : undefined,
      computedPowers: { ...state.battle.computedPowers },
    };
  }

  return {
    viewer,
    players: {
      player: makeVisiblePlayer('player'),
      opponent: makeVisiblePlayer('opponent'),
    },
    turnNumber: state.turnNumber,
    activePlayer: state.activePlayer,
    phase: state.phase,
    mulliganDecided: state.mulliganDecided ? { ...state.mulliganDecided } : undefined,
    battle: visibleBattle,
    winner: state.winner,
    winReason: state.winReason,
    events: [...state.events],
    config: { ...state.config },
  };
}

export const engine: EngineApi = {
  createMatch,
  getLegalActions,
  applyAction,
  getVisibleState,
};
