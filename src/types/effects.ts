/**
 * Effect DSL for Digimon Digital Card Battle support / option texts.
 * Semantics of every op are specified in docs/EFFECT_DSL.md.
 * Exported names are STABLE – other modules import them.
 */

// ---------------------------------------------------------------------------
// Primitive vocabulary
// ---------------------------------------------------------------------------

/** Whose state an op touches, relative to the card's user ("own"). */
export type Target = 'self' | 'opponent' | 'both';
/** Single player reference (used in refs/conditions). */
export type Who = 'self' | 'opponent';

/** The three attack slots. JSON tokens [[circle]] / [[triangle]] / [[x]]. */
export type AttackSlot = 'circle' | 'triangle' | 'x';

/**
 * Which attack-power value an attack-power op modifies.
 * - 'chosen': the attack the target player has selected this battle (default;
 *   "own Attack Power").
 * - a concrete slot: only that slot ("own [[circle]] Attack Power").
 * - 'all': all three slots.
 */
export type AttackSlotSel = AttackSlot | 'chosen' | 'all';

export type Specialty = 'Fire' | 'Ice' | 'Nature' | 'Darkness' | 'Rare';
/** Card levels as they appear in allCards.json ("R P" = Rookie Partner, "A" = Armor). */
export type Level = 'R' | 'C' | 'U' | 'A' | 'R P';

export type Cmp = 'lt' | 'lte' | 'eq' | 'neq' | 'gte' | 'gt';

/** Arithmetic mode for numeric stat ops. 'divide' rounds per docs (default: floor to 10). */
export type NumMode = 'add' | 'sub' | 'set' | 'multiply' | 'divide';

/** Readable numeric quantities. */
export type StatRef =
  | { stat: 'hp'; who: Who }
  | { stat: 'maxHp'; who: Who } // printed HP of the current active card
  | { stat: 'attackPower'; who: Who; slot?: AttackSlotSel } // current (already modified) value
  | { stat: 'dpCount'; who: Who } // cards in DP Slot
  | { stat: 'handCount'; who: Who }
  | { stat: 'onlineCount'; who: Who }
  | { stat: 'offlineCount'; who: Who }
  | { stat: 'koCount'; who: Who }
  | { stat: 'levelRank'; who: Who } // see RULES.md level ranking
  /** Number of cards moved by the most recent card-moving op in this same ops list. */
  | { stat: 'lastMovedCount' };

/** A number, or a stat reference optionally scaled: value = ref * mul + add. */
export type ValueExpr = number | { ref: StatRef; mul?: number; add?: number };

/** Count for card movement ops. */
export type CountExpr = number | 'all' | ValueExpr;

/** How cards are picked from a hidden/unordered zone (hand). */
export type Selection =
  | 'random'
  | 'owner' // owner of the zone chooses
  | 'user' // the player who used the effect chooses
  | 'unspecified'; // text doesn't say; engine uses config default (RULES.md)

export type Zone = 'online' | 'hand' | 'dpSlot' | 'offline' | 'battle';

/** Filter used by search ops. */
export interface CardFilter {
  levels?: Level[];
  specialties?: Specialty[];
  kind?: 'digimon' | 'option' | 'any';
  cardIds?: number[];
}

/** Cross-attack style abilities that an effect can grant to an attack. */
export type GrantedAbility =
  | { kind: 'eatUpHp' }
  | { kind: 'counter'; slot: AttackSlot | 'any' }
  | { kind: 'toZero'; slot: AttackSlot }
  | { kind: 'firstAttack' }
  | { kind: 'crash' }
  | { kind: 'jamming' }
  | { kind: 'foeX3'; specialty: Specialty };

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type Condition =
  | { cond: 'specialtyIs'; who: Who; in: Specialty[] }
  | { cond: 'specialtiesSame' }
  | { cond: 'levelIs'; who: Who; in: Level[] }
  /** Compares level ranks: self <cmp> opponent. */
  | { cond: 'levelCompare'; cmp: Cmp }
  /** Attack chosen (after forced changes applied so far) by `who`. */
  | { cond: 'attackIs'; who: Who; in: AttackSlot[] }
  | { cond: 'attacksSame' }
  | { cond: 'attacksDifferent' }
  /** Generic numeric comparison: left <cmp> right (HP, card counts, ...). */
  | { cond: 'compare'; left: ValueExpr; cmp: Cmp; right: ValueExpr }
  | { cond: 'not'; c: Condition }
  | { cond: 'and'; cs: Condition[] }
  | { cond: 'or'; cs: Condition[] };

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

export type EffectOp =
  // ----- attack power -----
  | { op: 'attackPower'; target: Target; slot?: AttackSlotSel; mode: NumMode; value: ValueExpr }
  /** Swap attack power values between players (chosen attacks). */
  | { op: 'swapAttackPower' }
  // ----- attack selection -----
  /** Force `target` to use `to` (overrides choice; "Opponent uses [[circle]]", "Own Attack becomes [[x]]"). */
  | { op: 'forceAttack'; target: Target; to: AttackSlot }
  /** Rotate chosen attack: circle→triangle→x→circle (Disrupt Ray). */
  | { op: 'rotateAttack'; target: Target; direction?: 'forward' | 'backward' }
  /** Give the target's chosen attack an extra ability for this battle ("own attack becomes Eat-up HP"). */
  | { op: 'grantAbility'; target: Target; ability: GrantedAbility }
  /** Remove the printed cross-attack ability of target's attack for this battle. */
  | { op: 'removeAbility'; target: Target }
  // ----- attack order -----
  | { op: 'attackFirst'; target: Target }
  | { op: 'attackSecond'; target: Target }
  // ----- HP -----
  | { op: 'hp'; target: Target; mode: NumMode; value: ValueExpr }
  | { op: 'swapHp' }
  /** If target's Digimon is KO'd this battle it stays in play with `hp` HP; the KO point is still awarded. */
  | { op: 'reviveOnKo'; target: Target; hp: number }
  // ----- specialty -----
  | { op: 'setSpecialty'; target: Target; to: Specialty | { copyFrom: Who } }
  | { op: 'swapSpecialty' }
  // ----- support interaction -----
  /** Cancel opponent's support. scope 'support' = text "Support Effect is voided"; 'supportAndOption' = "Support and Option Effects". */
  | { op: 'voidSupport'; target: Target; scope: 'support' | 'supportAndOption' }
  /** Copy a full stat block (Data Copy). */
  | { op: 'copyStats'; from: Who; stats: Array<'attackPower' | 'hp' | 'specialty'> }
  // ----- card movement -----
  | { op: 'draw'; target: Target; count: ValueExpr }
  | { op: 'drawUntil'; target: Target; handSize: number }
  | { op: 'discardHand'; target: Target; count: CountExpr; selection: Selection }
  /** Discard top cards of Online Deck to Offline ("Discard N Cards from Online Deck"). */
  | { op: 'mill'; target: Target; count: ValueExpr }
  /** Discard DP Slot cards to Offline. from 'top' = most recently placed. */
  | { op: 'discardDp'; target: Target; count: CountExpr; from?: 'top' | 'any'; selection?: Selection }
  /** Return hand to Online Deck. */
  | { op: 'handToDeck'; target: Target; shuffle: boolean }
  /** Move cards from top of Offline Pile to Online Deck. */
  | { op: 'recycleOffline'; target: Target; count: number; shuffle: boolean; position?: 'top' | 'bottom' }
  /** Search Online Deck for cards matching filter and put them in hand. */
  | { op: 'searchDeck'; target: Target; filter: CardFilter; count: number; selection: Selection; to: 'hand'; shuffleAfter?: boolean }
  // ----- digivolution (digivolve phase) -----
  /**
   * Relax digivolution requirements for the NEXT digivolution this phase.
   * All flags default false/0.
   */
  | {
      op: 'digivolveModifier';
      ignoreSpecialty?: boolean;
      ignoreLevel?: boolean; // any level → any level (Download)
      ignoreDp?: boolean;
      extraDp?: number; // DP added as if present in slot (Special Digivolve +20)
      allowSameLevel?: boolean; // Mutant
      allowSkipLevel?: boolean; // Warp R→U
      requireFromLevels?: Level[]; // e.g. ['A'] for ArmorCrush
      allowedToLevels?: Level[]; // e.g. ['C','U'] for ArmorCrush
      notInAbnormal?: boolean; // Speed Digivolve note
    }
  /** Replace the active Digimon by one of a lower level. */
  | { op: 'devolve'; target: Target; levels?: number; requireFromLevels?: Level[]; toLevel?: Level; onSuccess?: EffectOp[] }
  // ----- control flow -----
  | { op: 'if'; cond: Condition; then: EffectOp[]; else?: EffectOp[] }
  | { op: 'seq'; ops: EffectOp[] }
  /** Random branch, weights default equal. */
  | { op: 'random'; branches: Array<{ weight?: number; ops: EffectOp[] }> }
  /** Use the support effect of the top card of the target's Online Deck. */
  | { op: 'useTopCardSupport'; target: Who }
  /** Explicit no-op ("None"). */
  | { op: 'none' }
  /** Placeholder for not-yet-representable text; engine logs and ignores. */
  | { op: 'unimplemented'; text: string };

export type EffectTiming = 'support' | 'digivolvePhase' | 'both';

export interface ChoiceSpec {
  kind: 'pickCardsFromHand' | 'pickDpCard' | 'pickTargetLevel' | 'pickDigimonFromHand';
  who: Who;
  count?: number;
}

export interface CardEffectDef {
  cardId: number;
  timing: EffectTiming;
  ops: EffectOp[];
  notes?: string;
  requiresChoice?: ChoiceSpec;
}

export type EffectRegistry = Record<number, CardEffectDef>;
