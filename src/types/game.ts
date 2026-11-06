/**
 * Shared Type Contract for Digimon Digital Card Battle (PS1)
 *
 * Re-exports all Effect DSL primitives from `./effects` so that engine,
 * card database, AI, and UI layers share 100% unified types.
 */

import type {
  Target,
  Who,
  AttackSlot,
  AttackSlotSel,
  Specialty,
  Level,
  Cmp,
  NumMode,
  StatRef,
  ValueExpr,
  CountExpr,
  Selection,
  Zone,
  CardFilter,
  GrantedAbility,
  Condition,
  EffectOp,
  EffectTiming,
  ChoiceSpec,
  CardEffectDef,
  EffectRegistry,
} from './effects';

export type {
  Target,
  Who,
  AttackSlot,
  AttackSlotSel,
  Specialty,
  Level,
  Cmp,
  NumMode,
  StatRef,
  ValueExpr,
  CountExpr,
  Selection,
  Zone,
  CardFilter,
  GrantedAbility,
  Condition,
  EffectOp,
  EffectTiming,
  ChoiceSpec,
  CardEffectDef,
  EffectRegistry,
};

// ---------------------------------------------------------------------------
// Core Constants
// ---------------------------------------------------------------------------

export const DECK_SIZE = 30;
export const HAND_SIZE = 4;
export const KO_TO_WIN = 3;
export const MAX_COPIES = 4;
export const MAX_PARTNER_COPIES = 1;

// ---------------------------------------------------------------------------
// Card Model
// ---------------------------------------------------------------------------

export type CardId = number; // 0..300
export type CardKind = 'Digimon' | 'Option';

/**
 * Printed X-attack special effect on a Digimon card.
 */
export type XEffect =
  | { type: 'zero'; target: AttackSlot }
  | { type: 'counter'; target: AttackSlot }
  | { type: 'firstAttack' }
  | { type: 'eatUpHp' }
  | { type: 'crash' }
  | { type: 'jamming' }
  | { type: 'foeX3'; specialty: Specialty };

export interface CardAttack {
  name: string;
  power: number;
  effect?: XEffect;
}

export interface CardAttacks {
  circle: CardAttack;
  triangle: CardAttack;
  x: CardAttack;
}

export interface CardData {
  /** Numeric card ID 0..300 parsed from `no`. */
  id: CardId;
  /** Three-digit string number "000".."300". */
  no: string;
  /** Card display name. */
  name: string;
  /** 'Digimon' (000..190) or 'Option' (191..300). */
  kind: CardKind;
  /** Digimon level ('R' | 'C' | 'U' | 'A' | 'R P') or null for Option cards. */
  level: Level | null;
  /** Digimon specialty ('Fire' | 'Ice' | 'Nature' | 'Darkness' | 'Rare') or null for Option cards. */
  specialty: Specialty | null;
  /** True for Partner & Armor cards (cards 172..190, category === 'Partner'). */
  isPartner: boolean;
  /** Printed HP (0 for Option cards). */
  hp: number;
  /** DP required to Digivolve into this card (0 for Option, R, R P, A). */
  dp: number;
  /** +P points provided when placed into the DP Slot (0 for Option and A). */
  plusP: number;
  /** Printed Circle, Triangle, and X attacks (null for Option cards). */
  attacks: CardAttacks | null;
  /** Raw support/option effect text with [[circle]], [[triangle]], [[x]] tokens preserved. */
  supportText: string;
  /** Relative asset path under public/, e.g. "assets/cards/000_Imperialdramon.jpg". */
  image: string;
}

// ---------------------------------------------------------------------------
// Active Digimon & Player Zones
// ---------------------------------------------------------------------------

export type PlayerSide = 'player' | 'opponent';

export interface TempDigimonModifiers {
  /** Per-slot attack power adjustments for the current battle. */
  attackPowerAdd?: Partial<Record<AttackSlot | 'chosen' | 'all', number>>;
  /** Granted abilities for the current battle. */
  grantedAbilities?: GrantedAbility[];
  /** Whether printed X-attack ability is removed for this battle. */
  abilityRemoved?: boolean;
  /** If set, Digimon revives with this HP when KO'd this battle (KO point still awarded). */
  reviveOnKoHp?: number | null;
  /** Whether this Digimon's support/option effects are jammed. */
  jammed?: boolean;
}

export interface ActiveDigimon {
  /** Top (currently active) Digimon card ID. */
  cardId: CardId;
  /** Cards underneath in the digivolution stack (bottom to top, excluding current cardId). */
  stack: CardId[];
  /** Current HP in battle. */
  currentHp: number;
  /** Printed max HP of the active Digimon card. */
  maxHp: number;
  /** Current effective specialty (defaults to card's printed specialty, can be modified in battle). */
  effectiveSpecialty: Specialty;
  /** Temporary battle-scoped modifiers cleared after battle resolution. */
  tempModifiers?: TempDigimonModifiers;
}

/**
 * Active modifier set by a Digivolve Option card (e.g. Special Digivolve,
 * Speed Digivolve, Warp Digivolve, Mutant Digivolve, Download Digivolve, ArmorCrush).
 */
export interface DigivolveModifier {
  ignoreSpecialty?: boolean;
  ignoreLevel?: boolean;
  ignoreDp?: boolean;
  extraDp?: number;
  allowSameLevel?: boolean;
  allowSkipLevel?: boolean;
  requireFromLevels?: Level[];
  allowedToLevels?: Level[];
  notInAbnormal?: boolean;
  sourceCardId?: CardId;
}

export interface PlayerState {
  /** Online Deck (draw pile), ordered with top card at index 0. */
  online: CardId[];
  /** Cards currently in hand. */
  hand: CardId[];
  /** Active Digimon in the Battle Slot, or null if awaiting Rookie placement. */
  battleDigimon: ActiveDigimon | null;
  /** Cards stacked in the DP Slot (most recently placed at the end). */
  dpSlot: CardId[];
  /** Accumulated DP points in the DP Slot. */
  dpTotal: number;
  /** Offline Pile (discard / graveyard). */
  offline: CardId[];
  /** Number of opponent Digimon KO'd so far (wins at 3). */
  koCount: number;
  /** Pending digivolve modifier active during the current Digivolve phase. */
  activeDigivolveModifier?: DigivolveModifier | null;
}

// ---------------------------------------------------------------------------
// Match Phases & Battle Context
// ---------------------------------------------------------------------------

export type MatchPhase =
  | 'mulligan'
  | 'draw'
  | 'rookiePlacement'
  | 'digivolve'
  | 'attackSelect'
  | 'supportSelect'
  | 'battleResolve'
  | 'turnEnd'
  | 'gameOver';

export interface SupportSlotCard {
  cardId: CardId;
  source: 'hand' | 'deckTop';
  voided?: boolean;
}

export interface BattleContext {
  /** Who attacks first by default (can be changed by 1st Attack / support effects). */
  firstAttacker: PlayerSide;
  /** Who attacks second. */
  defender: PlayerSide;
  /** Initial attack slot chosen by each player. */
  chosenAttacks: Record<PlayerSide, AttackSlot | null>;
  /** Effective attack slot after forceAttack / rotateAttack effects. */
  effectiveAttacks?: Record<PlayerSide, AttackSlot | null>;
  /** Support / Option card played into the Support Slot by each player. */
  supportCards: Record<PlayerSide, SupportSlotCard | null>;
  /** Whether each player has finalized their support decision for this battle. */
  supportDecided?: Record<PlayerSide, boolean>;
  /** Computed final attack powers for each player during battle resolution. */
  computedPowers: Record<PlayerSide, number>;
  /** Extra abilities granted to each player's chosen attack this battle. */
  grantedAbilities?: Record<PlayerSide, GrantedAbility[]>;
  /** Whether each player's printed attack ability has been removed this battle. */
  abilityRemoved?: Record<PlayerSide, boolean>;
  /** Revive-on-KO HP for each player if triggered (e.g. Phoenixmon support). */
  reviveOnKo?: Record<PlayerSide, number | null>;
}

// ---------------------------------------------------------------------------
// Rules Configuration & Match State
// ---------------------------------------------------------------------------

export interface RulesConfig {
  /** How unspecified card selections (e.g. discard without explicit choice) are resolved. */
  unspecifiedSelection?: 'random' | 'first' | 'owner';
  /** Whether partner cards (Level 'R P' and 'A') are allowed in decks (max 1 copy). */
  allowPartnerCards?: boolean;
  /** Whether initial mulligan is enabled. */
  enableMulligan?: boolean;
}

export type WinReason = 'three_ko' | 'opponent_deck_out' | 'opponent_no_rookie';

export interface MatchState {
  players: Record<PlayerSide, PlayerState>;
  turnNumber: number;
  /** Whose turn it is (drives Digivolve phase and default first attacker). */
  activePlayer: PlayerSide;
  phase: MatchPhase;
  /** Tracks which sides have completed their mulligan choice during 'mulligan' phase. */
  mulliganDecided?: Record<PlayerSide, boolean>;
  battle: BattleContext | null;
  winner: PlayerSide | 'draw' | null;
  winReason?: WinReason;
  events: GameEvent[];
  rngSeed: number;
  config: RulesConfig;
}

// ---------------------------------------------------------------------------
// Game Events (for UI Animation & Battle Log)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: 'matchStarted'; firstPlayer: PlayerSide; seed: number }
  | { type: 'mulligan'; side: PlayerSide; kept: boolean }
  | { type: 'phaseChanged'; phase: MatchPhase; activePlayer: PlayerSide; turnNumber: number }
  | { type: 'cardsDrawn'; side: PlayerSide; cardIds: CardId[]; count: number }
  | { type: 'rookiePlaced'; side: PlayerSide; cardId: CardId; hp: number }
  | { type: 'dpCardAdded'; side: PlayerSide; cardId: CardId; plusP: number; newDpTotal: number }
  | {
      type: 'digivolved';
      side: PlayerSide;
      fromCardId: CardId;
      toCardId: CardId;
      hp: number;
      method: 'normal' | 'armor' | 'option';
    }
  | { type: 'digivolveOptionUsed'; side: PlayerSide; cardId: CardId; description: string }
  | { type: 'devolved'; side: PlayerSide; fromCardId: CardId; toCardId: CardId; hp: number }
  | { type: 'attackChosen'; side: PlayerSide; slot: AttackSlot }
  | { type: 'supportPlayed'; side: PlayerSide; cardId: CardId; source: 'hand' | 'deckTop' }
  | { type: 'supportPassed'; side: PlayerSide }
  | { type: 'supportTriggered'; side: PlayerSide; cardId: CardId; text: string }
  | { type: 'supportVoided'; side: PlayerSide; bySide: PlayerSide; cardId: CardId }
  | { type: 'statModified'; side: PlayerSide; stat: 'hp' | 'attackPower' | 'specialty'; delta?: number; newValue: number | Specialty; reason?: string }
  | { type: 'attackChanged'; side: PlayerSide; from: AttackSlot; to: AttackSlot; reason?: string }
  | { type: 'cardsMoved'; side: PlayerSide; from: Zone; to: Zone; cardIds: CardId[]; count: number }
  | {
      type: 'attackStrike';
      attacker: PlayerSide;
      defender: PlayerSide;
      slot: AttackSlot;
      attackName: string;
      damage: number;
      defenderHpBefore: number;
      defenderHpAfter: number;
      countered?: boolean;
      eatUpHpHealed?: number;
      crashSelfDamage?: number;
    }
  | { type: 'digimonKo'; side: PlayerSide; cardId: CardId; bySide: PlayerSide; newKoCount: number; revivedHp?: number }
  | { type: 'gameOver'; winner: PlayerSide | 'draw'; reason: WinReason }
  | { type: 'log'; message: string; side?: PlayerSide };

// ---------------------------------------------------------------------------
// Player / AI Actions
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'mulligan'; side: PlayerSide; keep: boolean }
  | { type: 'placeRookie'; side: PlayerSide; handIndex: number; cardId?: CardId }
  | { type: 'addToDp'; side: PlayerSide; handIndex: number; cardId?: CardId }
  | { type: 'digivolve'; side: PlayerSide; handIndex: number; cardId?: CardId }
  | { type: 'armorDigivolve'; side: PlayerSide; handIndex: number; cardId?: CardId }
  | { type: 'useDigivolveOption'; side: PlayerSide; handIndex: number; cardId?: CardId; targetHandIndex?: number }
  | { type: 'endDigivolvePhase'; side: PlayerSide }
  | { type: 'chooseAttack'; side: PlayerSide; slot: AttackSlot }
  | { type: 'playSupportFromHand'; side: PlayerSide; handIndex: number; cardId?: CardId }
  | { type: 'playSupportFromDeckTop'; side: PlayerSide }
  | { type: 'passSupport'; side: PlayerSide };

// ---------------------------------------------------------------------------
// Visible State (Information Hiding for UI / AI)
// ---------------------------------------------------------------------------

export interface VisiblePlayerState {
  /** Number of cards remaining in the Online Deck. */
  onlineCount: number;
  /** Number of cards in hand. */
  handCount: number;
  /** Actual hand card IDs (populated for the viewing player, hidden or omitted for opponent). */
  hand: CardId[];
  battleDigimon: ActiveDigimon | null;
  dpSlot: CardId[];
  dpTotal: number;
  offline: CardId[];
  koCount: number;
  activeDigivolveModifier?: DigivolveModifier | null;
}

export interface VisibleBattleContext {
  firstAttacker: PlayerSide;
  defender: PlayerSide;
  /** Chosen attack is hidden for opponent until both sides have selected. */
  chosenAttacks: Record<PlayerSide, AttackSlot | 'hidden' | null>;
  effectiveAttacks?: Record<PlayerSide, AttackSlot | null>;
  supportCards: Record<PlayerSide, SupportSlotCard | null>;
  supportDecided?: Record<PlayerSide, boolean>;
  computedPowers: Record<PlayerSide, number>;
}

export interface VisibleMatchState {
  viewer: PlayerSide;
  players: Record<PlayerSide, VisiblePlayerState>;
  turnNumber: number;
  activePlayer: PlayerSide;
  phase: MatchPhase;
  mulliganDecided?: Record<PlayerSide, boolean>;
  battle: VisibleBattleContext | null;
  winner: PlayerSide | 'draw' | null;
  winReason?: WinReason;
  events: GameEvent[];
  config: RulesConfig;
}

// ---------------------------------------------------------------------------
// Engine API Contract
// ---------------------------------------------------------------------------

export interface CreateMatchParams {
  playerDeck: CardId[];
  opponentDeck: CardId[];
  seed?: number;
  firstPlayer?: PlayerSide;
  config?: RulesConfig;
}

export interface EngineApi {
  createMatch(params: CreateMatchParams): MatchState;
  getLegalActions(state: MatchState, side: PlayerSide): Action[];
  applyAction(state: MatchState, action: Action): MatchState;
  getVisibleState(state: MatchState, viewer: PlayerSide): VisibleMatchState;
}
