# Digimon Digital Card Battle — Effect DSL Specification & Complete 301-Card Mapping

This document specifies the exact execution semantics of the Effect DSL defined in [`src/types/effects.ts`](../src/types/effects.ts) and provides an exhaustive, zero-ambiguity reference mapping all **301 cards (`000`–`300`)** to their `CardEffectDef` representations.

---

## 1. Core Concepts & Perspective (`Who` / `Target`)

Every `CardEffectDef` executes from the perspective of the **card's user**:
- `'self'` (`Who` / `Target`): The player who played the Support or Option card ("own").
- `'opponent'` (`Who` / `Target`): The opposing player ("opponent", "foe", "his").
- `'both'` (`Target`): Applies the operation to `'self'` first, then `'opponent'`.

### 1.1 Effect Timing (`EffectTiming`)
- `'support'`: Played in the **Support Slot** during the Battle Phase (`000`–`292`). Note: Digimon cards (`000`–`190`) always have `timing: 'support'` for their Support Effect (`S:`), while their printed X-attack effect (`xEffect`) is parsed/handled by the engine's X-attack step (see [Section 4](#4-printed-cross-attack-xeffect-catalog)).
- `'digivolvePhase'`: Option cards played from Hand during the **Preparation / Digivolve Phase** (`293`–`300`).
- `'both'`: Reserved for any effect usable in both phases (none of the base 301 cards require `'both'`).

---

## 2. Numeric Expressions, Stat References & Rounding

### 2.1 `StatRef` Evaluation
All `StatRef` values are read dynamically **at the exact moment the op or condition executes**:
- `{ stat: 'hp', who }`: Current battle HP of `who`'s active Digimon.
- `{ stat: 'maxHp', who }`: Printed base HP of `who`'s active Digimon (top card of `battle` stack).
- `{ stat: 'attackPower', who, slot }`: Current Attack Power of `who`'s active Digimon on `slot` (defaults to `'chosen'` — the attack slot currently selected by `who` after any prior `forceAttack` / `rotateAttack` ops).
- `{ stat: 'dpCount', who }`: Number of cards currently in `who`'s `dpSlot` (`dpSlot.length`).
- `{ stat: 'handCount', who }`: Number of cards currently in `who`'s `hand` (`hand.length`).
- `{ stat: 'onlineCount', who }`: Number of cards currently in `who`'s `online` deck (`online.length`).
- `{ stat: 'offlineCount', who }`: Number of cards currently in `who`'s `offline` pile (`offline.length`).
- `{ stat: 'koCount', who }`: Number of KOs scored by `who` (`0` to `3`).
- `{ stat: 'levelRank', who }`: Numeric rank of `who`'s active Digimon's Level (`'R': 1, 'R P': 1, 'C': 2, 'A': 2, 'U': 3`).
- `{ stat: 'lastMovedCount' }`: The exact number of cards actually moved/discarded by the **most recent card-moving op** (`discardHand`, `discardDp`, `mill`, `draw`, `recycleOffline`) executed earlier in the same `CardEffectDef`.
  - *Example*: If `122 Ogremon` executes `{ op: 'discardDp', target: 'self', count: 'all' }` when the player had `3` cards in their DP Slot, `lastMovedCount` becomes `3`. If the player had `0` cards in their DP Slot, `lastMovedCount` becomes `0`, and multiplying Attack Power by `0` sets Attack Power to `0`!

### 2.2 `ValueExpr` Calculation
Given a `ValueExpr`:
- If `number`: evaluates to that literal number.
- If `{ ref: StatRef, mul?: number, add?: number }`:
  $$\text{val} = \text{eval}(ref) \times (\text{mul} ?? 1) + (\text{add} ?? 0)$$

### 2.3 `NumMode` Arithmetic & Rounding Rules
Given current stat value $S$ and evaluated operand $V$:
- `'add'`: $S_{\text{new}} = \min(9990, S + V)$
- `'sub'`:
  - For `attackPower`: $S_{\text{new}} = \max(0, S - V)$
  - For `hp`: $S_{\text{new}} = \max(10, S - V)$ (non-damage effects cannot reduce HP below 10)
- `'set'`:
  - For `attackPower`: $S_{\text{new}} = \max(0, \min(9990, V))$
  - For `hp`: $S_{\text{new}} = \max(10, \min(9990, V))$
- `'multiply'`: $S_{\text{new}} = \min(9990, \max(0, S \times V))$
- `'divide'`:
  - Division always **floors to the nearest multiple of 10**:
    $$S_{\text{div}} = \left\lfloor \frac{S / V}{10} \right\rfloor \times 10$$
  - For `attackPower`: $S_{\text{new}} = \max(0, S_{\text{div}})$
  - For `hp`: $S_{\text{new}} = \max(10, S_{\text{div}})$

---

## 3. Semantics of Every `Condition` and `EffectOp`

### 3.1 Conditions (`Condition`)
| `cond` | Parameters | Semantics |
| :--- | :--- | :--- |
| `'specialtyIs'` | `who: Who`, `in: Specialty[]` | `true` iff `who`'s active Digimon's **current** Specialty is in `in`. |
| `'specialtiesSame'` | — | `true` iff `self`'s current Specialty equals `opponent`'s current Specialty. |
| `'levelIs'` | `who: Who`, `in: Level[]` | `true` iff `who`'s active Digimon's printed Level is in `in`. Note: When `in` contains `'R'` and `RulesConfig.partnerCountsAsRookieForEffects` is `true`, `'R P'` also matches! |
| `'levelCompare'` | `cmp: Cmp` | Compares `levelRank(self) <cmp> levelRank(opponent)`. For example, `{ cond: 'levelCompare', cmp: 'lt' }` is `"If own Level is lower / below opponent's"`. |
| `'attackIs'` | `who: Who`, `in: AttackSlot[]` | `true` iff `who`'s **current** `chosenAttack` is in `in`. |
| `'attacksSame'` | — | `true` iff `self.chosenAttack === opponent.chosenAttack`. |
| `'attacksDifferent'` | — | `true` iff `self.chosenAttack !== opponent.chosenAttack`. |
| `'compare'` | `left: ValueExpr`, `cmp: Cmp`, `right: ValueExpr` | Evaluates `eval(left) <cmp> eval(right)` where `lt` ($<$), `lte` ($\le$), `eq` ($=$), `neq` ($\ne$), `gte` ($\ge$), `gt` ($>$). |
| `'not'` | `c: Condition` | Logical negation `!eval(c)`. |
| `'and'` | `cs: Condition[]` | Logical conjunction `cs.every(eval)`. |
| `'or'` | `cs: Condition[]` | Logical disjunction `cs.some(eval)`. |

### 3.2 Effect Operations (`EffectOp`)

#### Attack Power Ops
- **`attackPower`**: `{ op: 'attackPower', target: Target, slot?: AttackSlotSel, mode: NumMode, value: ValueExpr }`
  - `slot` defaults to `'chosen'` (modifies only the target player's currently chosen attack slot).
  - If `slot` is `'circle' | 'triangle' | 'x'`, modifies that specific slot on `target` (even if `target` did not choose that slot, though it only impacts combat damage if `target` uses or is forced to use that slot).
  - If `slot` is `'all'`, modifies all three slots.
- **`swapAttackPower`**: `{ op: 'swapAttackPower' }`
  - Swaps `self`'s chosen Attack Power with `opponent`'s chosen Attack Power.

#### Attack Selection & Ability Ops
- **`forceAttack`**: `{ op: 'forceAttack', target: Target, to: AttackSlot }`
  - Overrides `target`'s `chosenAttack` to `to`.
  - *Important*: If `target` is forced *into* `'x'`, `target`'s printed `xEffect` becomes active (unless Jammed). If `target` is forced *out of* `'x'` into `'circle'` or `'triangle'`, `target`'s printed `xEffect` is deactivated!
- **`rotateAttack`**: `{ op: 'rotateAttack', target: Target, direction?: 'forward' | 'backward' }`
  - `'forward'` (default, used by `263 Disrupt Ray`): `'circle' -> 'triangle'`, `'triangle' -> 'x'`, `'x' -> 'circle'`.
  - `'backward'`: `'circle' -> 'x'`, `'x' -> 'triangle'`, `'triangle' -> 'circle'`.
- **`grantAbility`**: `{ op: 'grantAbility', target: Target, ability: GrantedAbility }`
  - Grants `ability` (`eatUpHp`, `counter`, `toZero`, `firstAttack`, `crash`, `jamming`, `foeX3`) to `target`'s active attack for this battle regardless of which slot is chosen.
- **`removeAbility`**: `{ op: 'removeAbility', target: Target }`
  - Strips `target`'s printed `xEffect` and any previously granted abilities for this battle.

#### Attack Order Ops
- **`attackFirst`**: `{ op: 'attackFirst', target: Target }`
  - Sets `target`'s attack order priority to `'first'`.
- **`attackSecond`**: `{ op: 'attackSecond', target: Target }`
  - Sets `target`'s attack order priority to `'second'`.

#### HP & Revival Ops
- **`hp`**: `{ op: 'hp', target: Target, mode: NumMode, value: ValueExpr }`
  - Modifies `target`'s active Digimon's current `hp` using `mode` and `value`. Clamped to `[10, 9990]`.
- **`swapHp`**: `{ op: 'swapHp' }`
  - Swaps `self`'s current `hp` with `opponent`'s current `hp`.
- **`reviveOnKo`**: `{ op: 'reviveOnKo', target: Target, hp: number }`
  - Registers a revival buff on `target`'s active Digimon for this battle. If `target`'s Digimon is reduced to `0` HP this battle, the opponent still scores `+1` KO point (`"Battle is still lost"`), but if the match does not end on that KO, `target`'s Digimon remains in the Battle Area with `hp` HP instead of going to `offline`.

#### Specialty Ops
- **`setSpecialty`**: `{ op: 'setSpecialty', target: Target, to: Specialty | { copyFrom: Who } }`
  - Sets `target`'s active Digimon's Specialty for the remainder of this battle (or copies `copyFrom`'s current Specialty).
- **`swapSpecialty`**: `{ op: 'swapSpecialty' }`
  - Swaps `self`'s current Specialty with `opponent`'s current Specialty for this battle.

#### Support & Stat Copy Ops
- **`voidSupport`**: `{ op: 'voidSupport', target: Target, scope: 'support' | 'supportAndOption' }`
  -Evaluated in Substep 3A (and if triggered dynamically). Marks `target`'s Support card as `voided`.
  - `scope: 'support'` voids Digimon support cards (`kind === 'digimon'`).
  - `scope: 'supportAndOption'` voids both Digimon and Option support cards (`253 Cherrymon's Mist`, `289 Mystic Sevens`).
- **`copyStats`**: `{ op: 'copyStats', from: Who, stats: Array<'attackPower' | 'hp' | 'specialty'> }`
  - Copies the specified current battle stats from `from` to the other player (`256 Data Copy` copies `['attackPower', 'hp', 'specialty']` from `'opponent'` to `'self'`).

#### Card Movement Ops
Every card movement op updates `lastMovedCount` to the exact integer number of cards actually moved.
- **`draw`**: `{ op: 'draw', target: Target, count: ValueExpr }`
  - Draws up to `eval(count)` cards from top of `target`'s `online` deck into `target`'s `hand`. Stops early if `online` becomes empty.
- **`drawUntil`**: `{ op: 'draw', ... }` / `{ op: 'drawUntil', target: Target, handSize: number }`
  - Draws from top of `target`'s `online` deck until `target.hand.length >= handSize` (if already $\ge$ `handSize`, draws `0` cards).
- **`discardHand`**: `{ op: 'discardHand', target: Target, count: CountExpr, selection: Selection }`
  - Discards `count` (`'all'` or evaluated number, clamped to `hand.length`) cards from `target`'s `hand` to `target`'s `offline` pile.
  - `selection`: `'random'` (uniformly random via RNG), `'owner'`, `'user'`, or `'unspecified'`.
- **`mill`**: `{ op: 'mill', target: Target, count: ValueExpr }`
  - Discards up to `eval(count)` cards from the top of `target`'s `online` deck to `target`'s `offline` pile.
- **`discardDp`**: `{ op: 'discardDp', target: Target, count: CountExpr, from?: 'top' | 'any', selection?: Selection }`
  - Discards `count` (`'all'` or evaluated number, clamped to `dpSlot.length`) cards from the top of `target`'s `dpSlot` to `target`'s `offline` pile.
- **`handToDeck`**: `{ op: 'handToDeck', target: Target, shuffle: boolean }`
  - Moves all cards in `target`'s `hand` to `target`'s `online` deck, and shuffles `online` if `shuffle === true` (`156 Nanimon`).
- **`recycleOffline`**: `{ op: 'recycleOffline', target: Target, count: number, shuffle: boolean, position?: 'top' | 'bottom' }`
  - Moves up to `count` cards from the top of `target`'s `offline` pile to `target`'s `online` deck (at `position`, default `'top'`), then shuffles `online` if `shuffle === true` (`154 PlatinumSukamon`, `247 Digimon Analyzer`, `291 Reverse Sevens`).
- **`searchDeck`**: `{ op: 'searchDeck', target: Target, filter: CardFilter, count: number, selection: Selection, to: 'hand', shuffleAfter?: boolean }`
  - Finds all cards in `target`'s `online` deck matching `filter`, selects up to `count` of them per `selection`, moves them to `target`'s `hand`, and shuffles `online` if `shuffleAfter` (`257 Partner Finder`).

#### Digivolution Ops (`timing: 'digivolvePhase'`)
- **`digivolveModifier`**: Registers a temporary modifier on `self` for the next digivolution performed during the current Preparation Phase.
- **`devolve`**: `{ op: 'devolve', target: Target, levels?: number, requireFromLevels?: Level[], toLevel?: Level, onSuccess?: EffectOp[] }`
  - Used by `298 De-Armor Digivolve` and `300 Digi-devolve`.
  - Checks that `target`'s active `battle` stack has at least 2 cards (an evolved Digimon on top of a lower-level card) and matches `requireFromLevels` (if specified).
  - Discards the top card of `battle` to `offline`, exposing the underlying card as the new Active Digimon with its `hp` reset to its printed `maxHp`, and then executes `onSuccess` (e.g., doubling HP for `300 Digi-devolve`).

---

## 4. Printed Cross-Attack (`xEffect`) Catalog

Every Digimon card's 3rd attack (`x`) has a short effect string after the comma in `cAttack` (e.g. `Shining Blade (0), [[circle]] Counter`). The engine maps these strings to `GrantedAbility | null` as follows:

| Printed `xEffect` String | `GrantedAbility` Representation | Cards Using This `xEffect` |
| :--- | :--- | :--- |
| `None` | `null` | `005, 022, 026, 033, 055, 068, 080, 085, 091, 095, 104, 116, 119, 121, 128, 131, 160, 163, 165, 175, 189` |
| `[[circle]] Counter` | `{ kind: 'counter', slot: 'circle' }` | `000, 006, 009, 012, 014, 015, 031, 042, 046, 059, 079, 086, 141, 149, 162, 172, 182, 183` |
| `[[triangle]] Counter` | `{ kind: 'counter', slot: 'triangle' }` | `010, 039, 041, 090, 099, 122, 167, 184` |
| `[[x]] Counter` | `{ kind: 'counter', slot: 'x' }` | `001, 030, 035, 060, 153, 156, 177` |
| `[[circle]] to 0` | `{ kind: 'toZero', slot: 'circle' }` | `011, 017, 023, 024, 027, 034, 038, 040, 044, 050, 051, 053, 054, 056, 062, 063, 064, 066, 069, 087, 088, 093, 096, 097, 126, 130, 135, 144, 151, 154, 155, 170, 171, 173, 174, 176, 179, 181, 187, 190` |
| `[[triangle]] to 0` | `{ kind: 'toZero', slot: 'triangle' }` | `049, 061, 076, 084, 134, 143, 185` |
| `[[x]] to 0` | `{ kind: 'toZero', slot: 'x' }` | `004, 045, 048, 067, 071, 083, 101, 133, 150, 157, 188` |
| `1st Attack` | `{ kind: 'firstAttack' }` | `007, 013, 020, 021, 029, 072, 074, 081, 089, 094, 112, 129, 148, 164, 180` |
| `Eat-Up HP` / `Eat-up HP` | `{ kind: 'eatUpHp' }` | `003, 073, 078, 098, 110, 111, 114, 117, 123, 127, 137` |
| `Jamming` | `{ kind: 'jamming' }` | `043, 057, 092, 102, 107, 109, 115, 118, 138, 139, 142, 145, 150, 158, 168, 186` |
| `Crash` | `{ kind: 'crash' }` | `025, 028, 103, 105, 108, 124, 125, 146, 166` |
| `Fire Foe x3` | `{ kind: 'foeX3', specialty: 'Fire' }` | `036, 037, 047, 052, 058, 065, 178` |
| `Ice Foe x3` / `Ice Foe x3.` | `{ kind: 'foeX3', specialty: 'Ice' }` | `002, 008, 018, 019, 032, 100` |
| `Nature Foe x3` | `{ kind: 'foeX3', specialty: 'Nature' }` | `016, 106, 113, 120, 132` |
| `Darkness Foe x3` / `Dark Foe x3` | `{ kind: 'foeX3', specialty: 'Darkness' }` | `070, 075, 077, 082, 147, 152` |
| `Rare Foe x3` | `{ kind: 'foeX3', specialty: 'Rare' }` | `136, 140, 159, 161, 169` |

---

## 5. Complete 301-Card Support / Option Effect Reference (`000`–`300`)

Below is the exact `ops` array for every card ID from `000` to `300`, organized into the three Wave-1 agent partitions:
- **Section 5.1**: Fire & Ice Digimon (`000`–`068`) — `timing: 'support'`
- **Section 5.2**: Nature, Darkness, Rare, Armor & Partner Digimon (`069`–`190`) — `timing: 'support'`
- **Section 5.3**: Option Cards (`191`–`300`) — `191`–`292` have `timing: 'support'`; `293`–`300` have `timing: 'digivolvePhase'`

---

### 5.1 Fire & Ice Digimon (`000`–`068`)

All cards in `000`–`068` have `timing: 'support'`.

| ID | Name | Support Effect Text | Exact `ops: EffectOp[]` |
| :--- | :--- | :--- | :--- |
| `000` | Imperialdramon | Add number of DP Cards in DP Slot x100 to own Attack Power. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'dpCount', who: 'self' }, mul: 100 } }]` |
| `001` | Omnimon I | Changes own Specialty to Fire. Boost own Attack Power +100. | `[{ op: 'setSpecialty', target: 'self', to: 'Fire' }, { op: 'attackPower', target: 'self', mode: 'add', value: 100 }]` |
| `002` | WarGreymon | Add number of Cards in Hand x100 to own Attack Power. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'handCount', who: 'self' }, mul: 100 } }]` |
| `003` | Phoenixmon | Digimon KO'd in battle revives with 500 HP. Battle is still lost. | `[{ op: 'reviveOnKo', target: 'self', hp: 500 }]` |
| `004` | Paildramon | If own Specialty is Fire, boost own Attack Power +300. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }] }]` |
| `005` | Gigadramon | None | `[{ op: 'none' }]` |
| `006` | RealMetalGreymon | Boost own Attack Power +300. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }]` |
| `007` | Garudamon | If own Attack is `[[circle]]`, attack first. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'self', in: ['circle'] }, then: [{ op: 'attackFirst', target: 'self' }] }]` |
| `008` | MasterTyrannomon | If own Specialty is Fire, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `009` | MetalGreymon | If own Level is U, boost own Attack Power +500. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['U'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }] }]` |
| `010` | Vermilimon | None | `[{ op: 'none' }]` |
| `011` | Meteormon | Lower opponent's `[[circle]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }]` |
| `012` | ExVeemon | If own Level is A, boost own Attack Power +300. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['A'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }] }]` |
| `013` | Aquilamon | If own attack is `[[triangle]]`, attack first. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'self', in: ['triangle'] }, then: [{ op: 'attackFirst', target: 'self' }] }]` |
| `014` | Greymon | If own Level is C, boost own Attack Power +300. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['C'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }] }]` |
| `015` | Apemon | Change own Specialty to Fire. Boost own Attack Power +200. | `[{ op: 'setSpecialty', target: 'self', to: 'Fire' }, { op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `016` | Tyrannomon | None | `[{ op: 'none' }]` |
| `017` | Monochromon | None | `[{ op: 'none' }]` |
| `018` | Meramon | If opponent's Specialty is Ice, own Attack Power is tripled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Ice'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }] }]` |
| `019` | Centarumon | Use `[[circle]]` and Boost own `[[circle]]` Attack Power +400. | `[{ op: 'forceAttack', target: 'self', to: 'circle' }, { op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 400 }]` |
| `020` | Birdramon | Attack first. | `[{ op: 'attackFirst', target: 'self' }]` |
| `021` | Tankmon | Own HP become 10. Boost own Attack Power +500. | `[{ op: 'hp', target: 'self', mode: 'set', value: 10 }, { op: 'attackPower', target: 'self', mode: 'add', value: 500 }]` |
| `022` | RedVegiemon | Discard all own DP Cards in DP Slot, boost own Attack Power +300. | `[{ op: 'discardDp', target: 'self', count: 'all' }, { op: 'attackPower', target: 'self', mode: 'add', value: 300 }]` |
| `023` | Piddomon | Own `[[circle]]` Attack Power becomes same as own HP. | `[{ op: 'attackPower', target: 'self', slot: 'circle', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } }]` |
| `024` | Akatorimon | Boost own Attack Power +200. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `025` | BomberNanimon | If both Levels are C, boost own Attack Power +400. | `[{ op: 'if', cond: { cond: 'and', cs: [{ cond: 'levelIs', who: 'self', in: ['C'] }, { cond: 'levelIs', who: 'opponent', in: ['C'] }] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }] }]` |
| `026` | Flarerizamon | Change own Specialty to Fire. | `[{ op: 'setSpecialty', target: 'self', to: 'Fire' }]` |
| `027` | Agumon | Boost own `[[circle]]` Attack Power +300. | `[{ op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 300 }]` |
| `028` | Solarmon | None | `[{ op: 'none' }]` |
| `029` | Biyomon | Boost own Attack Power +200. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `030` | Muchomon | Boost own `[[triangle]]` Attack Power +300. | `[{ op: 'attackPower', target: 'self', slot: 'triangle', mode: 'add', value: 300 }]` |
| `031` | Candlemon | Boost own `[[x]]` Attack Power +200. | `[{ op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 200 }]` |
| `032` | D-Otamamon | If opponent's Specialty is Ice, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Ice'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `033` | Goburimon | None | `[{ op: 'none' }]` |
| `034` | Vikemon | None | `[{ op: 'none' }]` |
| `035` | Omnimon II | Change own Specialty to Ice. Recover own HP by +100. | `[{ op: 'setSpecialty', target: 'self', to: 'Ice' }, { op: 'hp', target: 'self', mode: 'add', value: 100 }]` |
| `036` | MetalSeadramon | If own Specialty is Ice, opponent's Support Effect is voided. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Ice'] }, then: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }] }]` |
| `037` | MetalGarurumon | If own Cards in Hand 3 or more, opponent's Attack Power becomes 0. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'handCount', who: 'self' } }, cmp: 'gte', right: 3 }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `038` | MarineAngemon | Recover own HP by +200. | `[{ op: 'hp', target: 'self', mode: 'add', value: 200 }]` |
| `039` | WereGarurumon | Add number of DP Cards in DP Slot x100 to own HP. | `[{ op: 'hp', target: 'self', mode: 'add', value: { ref: { stat: 'dpCount', who: 'self' }, mul: 100 } }]` |
| `040` | Zudomon | If own Specialty is Ice, opponent's Attack Power is halved. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Ice'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'divide', value: 2 }] }]` |
| `041` | Panjyamon | `[[triangle]]` Counterattack. Attack second. | `[{ op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'triangle' } }, { op: 'attackSecond', target: 'self' }]` |
| `042` | MegaSeadramon | `[[circle]]` Counterattack. Attack second. | `[{ op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'circle' } }, { op: 'attackSecond', target: 'self' }]` |
| `043` | WaruSeadramon | Opponent's Support Effect is voided. | `[{ op: 'voidSupport', target: 'opponent', scope: 'support' }]` |
| `044` | Brachiomon | Lower opponent's `[[circle]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }]` |
| `045` | BlueMeramon | Lower opponent's `[[x]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }]` |
| `046` | Garurumon | Opponent uses `[[circle]]`. | `[{ op: 'forceAttack', target: 'opponent', to: 'circle' }]` |
| `047` | Ikkakumon | If opponent's Specialty is Fire, own Attack Power is tripled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }] }]` |
| `048` | Dolphmon | If own Attack is not `[[circle]]`, recover own HP by +300. | `[{ op: 'if', cond: { cond: 'not', c: { cond: 'attackIs', who: 'self', in: ['circle'] } }, then: [{ op: 'hp', target: 'self', mode: 'add', value: 300 }] }]` |
| `049` | Whamon | Own HP become 700. | `[{ op: 'hp', target: 'self', mode: 'set', value: 700 }]` |
| `050` | Seadramon | Opponent's Attack Power is halved. | `[{ op: 'attackPower', target: 'opponent', mode: 'divide', value: 2 }]` |
| `051` | Gesomon | None | `[{ op: 'none' }]` |
| `052` | Frigimon | Recover own HP by +200. | `[{ op: 'hp', target: 'self', mode: 'add', value: 200 }]` |
| `053` | Gekomon | Change opponent's Specialty to Ice. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Ice' }]` |
| `054` | Coelamon | Lower opponent's `[[circle]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }]` |
| `055` | Mojyamon | Recover own HP by +200. | `[{ op: 'hp', target: 'self', mode: 'add', value: 200 }]` |
| `056` | Shellmon | If opponent used `[[circle]]`, change it to `[[x]]`. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'opponent', in: ['circle'] }, then: [{ op: 'forceAttack', target: 'opponent', to: 'x' }] }]` |
| `057` | Sorcerimon | Change own Specialty to Ice. | `[{ op: 'setSpecialty', target: 'self', to: 'Ice' }]` |
| `058` | IceDevimon | If opponent's Specialty is fire, own Attack Power is tripled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }] }]` |
| `059` | Hyogamon | None | `[{ op: 'none' }]` |
| `060` | Icemon | None | `[{ op: 'none' }]` |
| `061` | Gomamon | Lower opponent's `[[triangle]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'triangle', mode: 'set', value: 0 }]` |
| `062` | Gabumon | None | `[{ op: 'none' }]` |
| `063` | Betamon | If own HP are less then 200, reduce opponent's Attack Power to 0. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'self' } }, cmp: 'lt', right: 200 }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `064` | Penguinmon | If opponent's Specialty is Fire, reduce opponent's Attack Power to 0. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `065` | Gizamon | If opponent's Specialty is Fire, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `066` | Otamamon | Reduce opponent's `[[circle]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }]` |
| `067` | SnowAgumon | Reduce opponent's `[[x]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }]` |
| `068` | SnowGoburimon | None | `[{ op: 'none' }]` |

---

### 5.2 Nature, Darkness, Rare, Armor & Partner Digimon (`069`–`190`)

All cards in `069`–`190` have `timing: 'support'`.

| ID | Name | Support Effect Text | Exact `ops: EffectOp[]` |
| :--- | :--- | :--- | :--- |
| `069` | Valkyrimon | Opponent uses O. | `[{ op: 'forceAttack', target: 'opponent', to: 'circle' }]` |
| `070` | Seraphimon | If opponent's Specialty is Darkness, own Attack Power is +200 & HP +200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }] }]` |
| `071` | Magnadramon | `[[x]]` Counterattack. Attack second. | `[{ op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'x' } }, { op: 'attackSecond', target: 'self' }]` |
| `072` | AeroVeedramon | If own level is U, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['U'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `073` | Rosemon | If opponent's HP are 1000+, own attack becomes "Eat-up HP." | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'gte', right: 1000 }, then: [{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }] }]` |
| `074` | HerculesKabuterimon | None | `[{ op: 'none' }]` |
| `075` | MagnaAngemon | If opponent's Specialty is Darkness, boost own Attack Power +500. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }] }]` |
| `076` | Silphymon | If opponent's Specialty is not Nature, attack second. | `[{ op: 'if', cond: { cond: 'not', c: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] } }, then: [{ op: 'attackSecond', target: 'self' }] }]` |
| `077` | Angewomon | If opponent's Specialty is Darkness, recover own HP by +500. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'hp', target: 'self', mode: 'add', value: 500 }] }]` |
| `078` | Lillymon | Recover own HP by +200. | `[{ op: 'hp', target: 'self', mode: 'add', value: 200 }]` |
| `079` | MegaKabuterimon | None | `[{ op: 'none' }]` |
| `080` | Piximon | Opponent's Support Effect is voided. Own Attack Power is halved. | `[{ op: 'voidSupport', target: 'opponent', scope: 'support' }, { op: 'attackPower', target: 'self', mode: 'divide', value: 2 }]` |
| `081` | Veedramon | If own level is U, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['U'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `082` | Angemon | If opponent's Specialty is Darkness, own Attack Power is tripled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }] }]` |
| `083` | R-Gatomon | If own HP are less than 500, boost own Attack Power +300. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'self' } }, cmp: 'lt', right: 500 }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }] }]` |
| `084` | Togemon | Boost own Attack Power +100. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }]` |
| `085` | Leomon | If own level is lower, boost own Attack Power +500. | `[{ op: 'if', cond: { cond: 'levelCompare', cmp: 'lt' }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }] }]` |
| `086` | Kabuterimon | None | `[{ op: 'none' }]` |
| `087` | Airdramon | Recover own HP by +100. Boost own Attack Power by +100. | `[{ op: 'hp', target: 'self', mode: 'add', value: 100 }, { op: 'attackPower', target: 'self', mode: 'add', value: 100 }]` |
| `088` | Unimon | If opponent's Specialty is Darkness, lower opponent's Attack Power to 0. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `089` | Ninjamon | Attack first. | `[{ op: 'attackFirst', target: 'self' }]` |
| `090` | Kuwagamon | None | `[{ op: 'none' }]` |
| `091` | Drimogemon | Boost own Attack Power +200. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `092` | Vegiemon | Changes opponent's Specialty to Nature. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Nature' }]` |
| `093` | Kokatorimon | Lower opponent's Attack Power to 0. Opponent's HP are doubled. | `[{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }, { op: 'hp', target: 'opponent', mode: 'multiply', value: 2 }]` |
| `094` | Yanmamon | None | `[{ op: 'none' }]` |
| `095` | J-Mojyamon | If own Level is R, boost own Attack Power +300. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['R'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }] }]` |
| `096` | MoriShellmon | If opponent's Specialty is Darkness, lower opponent's Attack Power -200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'sub', value: 200 }] }]` |
| `097` | Tentomon | None | `[{ op: 'none' }]` |
| `098` | Palmon | None | `[{ op: 'none' }]` |
| `099` | Salamon | Changes own Specialty to Nature. Draw 1 Card. | `[{ op: 'setSpecialty', target: 'self', to: 'Nature' }, { op: 'draw', target: 'self', count: 1 }]` |
| `100` | Elecmon | If opponent's Specialty is Ice, boost own Attack Power +300. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Ice'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }] }]` |
| `101` | Gotsumon | If own HP are more than opponent's HP, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'self' } }, cmp: 'gt', right: { ref: { stat: 'hp', who: 'opponent' } } }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `102` | Kunemon | Lower both Attack Powers -200. | `[{ op: 'attackPower', target: 'both', mode: 'sub', value: 200 }]` |
| `103` | Apokarimon | Own HP are halved. Change own Specialty to Darkness. | `[{ op: 'hp', target: 'self', mode: 'divide', value: 2 }, { op: 'setSpecialty', target: 'self', to: 'Darkness' }]` |
| `104` | GranKuwagamon | Discard 7 Cards from own Online Deck. Opponent's HP are halved. | `[{ op: 'mill', target: 'self', count: 7 }, { op: 'hp', target: 'opponent', mode: 'divide', value: 2 }]` |
| `105` | Diaboromon | Own HP become 10. Changes opponent's Specialty to Darkness. | `[{ op: 'hp', target: 'self', mode: 'set', value: 10 }, { op: 'setSpecialty', target: 'opponent', to: 'Darkness' }]` |
| `106` | VenomMyotismon | None | `[{ op: 'none' }]` |
| `107` | Piedmon | Both players discard all Cards in Hands. | `[{ op: 'discardHand', target: 'both', count: 'all', selection: 'unspecified' }]` |
| `108` | Machinedramon | None | `[{ op: 'none' }]` |
| `109` | Infermon | Discard 5 Cards from own Online Deck. Boost own Attack Power +400. | `[{ op: 'mill', target: 'self', count: 5 }, { op: 'attackPower', target: 'self', mode: 'add', value: 400 }]` |
| `110` | LadyDevimon | Both players boost Attack Power +200. | `[{ op: 'attackPower', target: 'both', mode: 'add', value: 200 }]` |
| `111` | Myotismon | Digimon KO'd in battle revives with 500 HP. Battle is still lost. | `[{ op: 'reviveOnKo', target: 'self', hp: 500 }]` |
| `112` | Megadramon | Both players' HP are halved. | `[{ op: 'hp', target: 'both', mode: 'divide', value: 2 }]` |
| `113` | SkullGreymon | If opponent's Specialty is Nature, opponent discards all Cards. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] }, then: [{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }] }]` |
| `114` | Phantomon | Discard 7 Cards from own Online Deck, own Attack is "Eat-up HP." | `[{ op: 'mill', target: 'self', count: 7 }, { op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }]` |
| `115` | WaruMonzaemon | Own HP become 10. Own Attack Power is doubled. | `[{ op: 'hp', target: 'self', mode: 'set', value: 10 }, { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }]` |
| `116` | Andromon | Own HP are halved. Boost own Attack Power +400. | `[{ op: 'hp', target: 'self', mode: 'divide', value: 2 }, { op: 'attackPower', target: 'self', mode: 'add', value: 400 }]` |
| `117` | Stingmon | Discard 1 DP Card from own DP Slot. Boost own Attack Power +200. | `[{ op: 'discardDp', target: 'self', count: 1, from: 'top' }, { op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `118` | Wizardmon | Discard all Cards in own Hand, then draw 2 Cards. | `[{ op: 'discardHand', target: 'self', count: 'all', selection: 'unspecified' }, { op: 'draw', target: 'self', count: 2 }]` |
| `119` | Devidramon | Own Attack becomes `[[triangle]]`. | `[{ op: 'forceAttack', target: 'self', to: 'triangle' }]` |
| `120` | Devimon | If opponent's Specialty is Nature, own Attack Power is tripled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }] }]` |
| `121` | Tuskmon | Own Attack becomes `[[x]]`. | `[{ op: 'forceAttack', target: 'self', to: 'x' }]` |
| `122` | Ogremon | Discard Cards in own DP Slot and multiply Attack Power by number of discards. | `[{ op: 'discardDp', target: 'self', count: 'all' }, { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } }]` |
| `123` | Bakemon | Change own Specialty to Darkness. | `[{ op: 'setSpecialty', target: 'self', to: 'Darkness' }]` |
| `124` | Guardromon | Own HP are halved. Boost own Attack Power +300. | `[{ op: 'hp', target: 'self', mode: 'divide', value: 2 }, { op: 'attackPower', target: 'self', mode: 'add', value: 300 }]` |
| `125` | Tekkamon | Both players boost Attack Power +300. | `[{ op: 'attackPower', target: 'both', mode: 'add', value: 300 }]` |
| `126` | Gururumon | Both players use `[[triangle]]`. | `[{ op: 'forceAttack', target: 'both', to: 'triangle' }]` |
| `127` | Soulmon | Discard 1 Card in DP Slot. change opponent's Specialty to Darkness. | `[{ op: 'discardDp', target: 'self', count: 1, from: 'top' }, { op: 'setSpecialty', target: 'opponent', to: 'Darkness' }]` |
| `128` | Fugamon | Own Attack becomes `[[circle]]`. | `[{ op: 'forceAttack', target: 'self', to: 'circle' }]` |
| `129` | Saberdramon | Both players use `[[x]]`. | `[{ op: 'forceAttack', target: 'both', to: 'x' }]` |
| `130` | Darkrizamon | Both players use `[[circle]]`. | `[{ op: 'forceAttack', target: 'both', to: 'circle' }]` |
| `131` | Zassomon | Opponent's Attack Power become 300. | `[{ op: 'attackPower', target: 'opponent', mode: 'set', value: 300 }]` |
| `132` | DemiDevimon | If opponent's Specialty is Nature, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `133` | BKGatomon | If opponent's Level is A, opponent's HP are halved. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'opponent', in: ['A'] }, then: [{ op: 'hp', target: 'opponent', mode: 'divide', value: 2 }] }]` |
| `134` | Kokuwamon | Reduce own Attack Power by -100. Recover own HP by +200. | `[{ op: 'attackPower', target: 'self', mode: 'sub', value: 100 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }]` |
| `135` | Tsukaimon | Boost own `[[x]]` Attack Power +200. `[[circle]]` & `[[triangle]]` Attack Power are 0. | `[{ op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 200 }, { op: 'attackPower', target: 'self', slot: 'circle', mode: 'set', value: 0 }, { op: 'attackPower', target: 'self', slot: 'triangle', mode: 'set', value: 0 }]` |
| `136` | Dokunemon | If opponent's Specialty is Rare, opponent's HP become 100. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Rare'] }, then: [{ op: 'hp', target: 'opponent', mode: 'set', value: 100 }] }]` |
| `137` | Aruraumon | Own Attack becomes "Eat-up HP." Own Attack Power is halved. | `[{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }, { op: 'attackPower', target: 'self', mode: 'divide', value: 2 }]` |
| `138` | Sharmamon | Opponent's HP are halved. opponent's Attack Power is doubled. | `[{ op: 'hp', target: 'opponent', mode: 'divide', value: 2 }, { op: 'attackPower', target: 'opponent', mode: 'multiply', value: 2 }]` |
| `139` | Puppetmon | Discard 1 of opponent's Cards in DP Slot. Draw 1 Card. | `[{ op: 'discardDp', target: 'opponent', count: 1, from: 'top' }, { op: 'draw', target: 'self', count: 1 }]` |
| `140` | SuperStarmon | If opponent's Specialty is Rare, lower opponent's Attack Power to 0. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Rare'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `141` | MetalEtemon | `[[circle]]` Counterattack. Attack second. | `[{ op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'circle' } }, { op: 'attackSecond', target: 'self' }]` |
| `142` | Shakkoumon | Recover own HP by +100. Boost own `[[x]]` Attack Power by +100. | `[{ op: 'hp', target: 'self', mode: 'add', value: 100 }, { op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 100 }]` |
| `143` | Jijimon | If opponent's Specialty is Darkness, lower opponent's Attack Power to 0. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `144` | Digitamamon | Swap own Specialty with opponent's Specialty. | `[{ op: 'swapSpecialty' }]` |
| `145` | Vademon | Opponent's Specialty becomes the same as own Specialty. | `[{ op: 'setSpecialty', target: 'opponent', to: { copyFrom: 'self' } }]` |
| `146` | Giromon | Opponent uses `[[x]]`. | `[{ op: 'forceAttack', target: 'opponent', to: 'x' }]` |
| `147` | Monzaemon | Recover own HP by +200. Boost own Attack Power by +100. | `[{ op: 'hp', target: 'self', mode: 'add', value: 200 }, { op: 'attackPower', target: 'self', mode: 'add', value: 100 }]` |
| `148` | MetalMamemon | None | `[{ op: 'none' }]` |
| `149` | Mamemon | None | `[{ op: 'none' }]` |
| `150` | Etemon | Lower opponent's `[[x]]` Attack Power to 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }]` |
| `151` | Ankylomon | If opponent has more than 2 Cards in DP Slot, his Attack Power is 0. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'dpCount', who: 'opponent' } }, cmp: 'gt', right: 2 }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `152` | Starmon | If opponent's Specialty is Darkness, opponent's Support Effect is voided. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }] }]` |
| `153` | Thundermon | If opponent used `[[x]]`, discard all Cards in opponent's Hand. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'opponent', in: ['x'] }, then: [{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }] }]` |
| `154` | PlatinumSukamon | Move the top Card from Offline Pile to Online Deck. | `[{ op: 'recycleOffline', target: 'self', count: 1, shuffle: false, position: 'top' }]` |
| `155` | ShellNumemon | Discard opponent's top DP Card shown in DP Slot. | `[{ op: 'discardDp', target: 'opponent', count: 1, from: 'top' }]` |
| `156` | Nanimon | Return all Cards in own Hand to Online Deck and Shuffle. | `[{ op: 'handToDeck', target: 'self', shuffle: true }]` |
| `157` | Numemon | Discard opponent's 2 top DP Cards in his DP Slot. | `[{ op: 'discardDp', target: 'opponent', count: 2, from: 'top' }]` |
| `158` | Sukamon | Discard 1 Card from opponent's Hand at random. | `[{ op: 'discardHand', target: 'opponent', count: 1, selection: 'random' }]` |
| `159` | Rockmon | Discard 3 Cards from opponent's Online Deck. | `[{ op: 'mill', target: 'opponent', count: 3 }]` |
| `160` | Geremon | Discard all Cards in DP Slot. Foe discards same number of DP Cards. | `[{ op: 'discardDp', target: 'self', count: 'all' }, { op: 'discardDp', target: 'opponent', count: { ref: { stat: 'lastMovedCount' } }, from: 'top' }]` |
| `161` | NiseDrimogemon | Opponent uses `[[triangle]]`. | `[{ op: 'forceAttack', target: 'opponent', to: 'triangle' }]` |
| `162` | ShimaUnimon | None | `[{ op: 'none' }]` |
| `163` | MudFrigimon | None | `[{ op: 'none' }]` |
| `164` | SandYanmamon | Opponent uses `[[circle]]`. Lower opponent's Attack Power -100. | `[{ op: 'forceAttack', target: 'opponent', to: 'circle' }, { op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 }]` |
| `165` | L-ToyAgumon | If 1 or less Cards left in own Hand, opponent's Attack Power goes to 0. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'handCount', who: 'self' } }, cmp: 'lte', right: 1 }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `166` | Hagurumon | Discard all Cards in DP Slot. Recover HP, number of discards x100. | `[{ op: 'discardDp', target: 'self', count: 'all' }, { op: 'hp', target: 'self', mode: 'add', value: { ref: { stat: 'lastMovedCount' }, mul: 100 } }]` |
| `167` | ToyAgumon | Discard 1 Card at random from own Hand. HP of both Players are 200. | `[{ op: 'discardHand', target: 'self', count: 1, selection: 'random' }, { op: 'hp', target: 'both', mode: 'set', value: 200 }]` |
| `168` | ClearAgumon | Opponent's Support Effect is voided. | `[{ op: 'voidSupport', target: 'opponent', scope: 'support' }]` |
| `169` | Vi-Elecmon | None | `[{ op: 'none' }]` |
| `170` | Psychemon | Own HP become same as opponent's. | `[{ op: 'hp', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'opponent' } } }]` |
| `171` | ModokiBetamon | Opponent's HP become same as own. Own Attack Power becomes 0. | `[{ op: 'hp', target: 'opponent', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } }, { op: 'attackPower', target: 'self', mode: 'set', value: 0 }]` |
| `172` | Flamedramon | Boost own Attack Power +100. Draw 1 Card. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `173` | Magnamon | Boost own Attack Power by +100. Draw 1 Card. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `174` | Baronmon | If foe's Specialty is Darkness, own Attack Power is Doubled. Draw 1 Card. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }, { op: 'draw', target: 'self', count: 1 }]` |
| `175` | Veemon | Boost own Attack Power +100. Draw 1 Card. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `176` | Submarimon | Discard 2 Cards from opponent's Online Deck. Draw 1 Card. | `[{ op: 'mill', target: 'opponent', count: 2 }, { op: 'draw', target: 'self', count: 1 }]` |
| `177` | Quetzalmon | Lower Opponent's Attack Power -100. Draw 1 Card. | `[{ op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `178` | Tylomon | Change own Specialty to Nature. Draw 1 Card. | `[{ op: 'setSpecialty', target: 'self', to: 'Nature' }, { op: 'draw', target: 'self', count: 1 }]` |
| `179` | Halsemon | Draw 3 Cards. | `[{ op: 'draw', target: 'self', count: 3 }]` |
| `180` | Pegasusmon | If foe's Specialty is Nature, own Attack Power is doubled. Draw 1 Card. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }, { op: 'draw', target: 'self', count: 1 }]` |
| `181` | Nefertimon | Change own Specialty to Nature. Draw 1 card. | `[{ op: 'setSpecialty', target: 'self', to: 'Nature' }, { op: 'draw', target: 'self', count: 1 }]` |
| `182` | Hawkmon | Draw 3 Cards. | `[{ op: 'draw', target: 'self', count: 3 }]` |
| `183` | Patamon | If foe's Specialty is Darkness, own Attack Power is doubled. Draw 1 Card. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }, { op: 'draw', target: 'self', count: 1 }]` |
| `184` | Gatomon | Change own Specialty to Nature. Draw 1 Card. | `[{ op: 'setSpecialty', target: 'self', to: 'Nature' }, { op: 'draw', target: 'self', count: 1 }]` |
| `185` | Raidramon | Boost own Attack Power by +100. Draw 1 Card. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `186` | Shadramon | Lower Opponent's Attack Power -100. Draw 1 Card. | `[{ op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `187` | Wormmon | Lower Opponent's Attack Power -100. Draw 1 Card. | `[{ op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 }, { op: 'draw', target: 'self', count: 1 }]` |
| `188` | Shurimon | Draw 3 Cards. | `[{ op: 'draw', target: 'self', count: 3 }]` |
| `189` | Digmon | Discard 2 Cards from opponent's Online Deck. Draw 1 Card. | `[{ op: 'mill', target: 'opponent', count: 2 }, { op: 'draw', target: 'self', count: 1 }]` |
| `190` | Armadillomon | Discard 2 Cards from opponent's Online Deck. Draw 1 Card. | `[{ op: 'mill', target: 'opponent', count: 2 }, { op: 'draw', target: 'self', count: 1 }]` |

---

### 5.3 Option Cards (`191`–`300`)

Cards `191`–`292` have `timing: 'support'`. Cards `293`–`300` have `timing: 'digivolvePhase'`.

| ID | Name | Timing | Effect Text | Exact `ops: EffectOp[]` |
| :--- | :--- | :--- | :--- | :--- |
| `191` | Golden Banana | `support` | Own HP are halved. Counterattack. Attack second. | `[{ op: 'hp', target: 'self', mode: 'divide', value: 2 }, { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'any' } }, { op: 'attackSecond', target: 'self' }]` |
| `192` | Devil's Chip | `support` | Discard 1 Card from own Hand. Boost both players' Attack Power +600. | `[{ op: 'discardHand', target: 'self', count: 1, selection: 'unspecified' }, { op: 'attackPower', target: 'both', mode: 'add', value: 600 }]` |
| `193` | Whistle | `support` | If own Level is below opponent's, opponent's Attack Power becomes 0. | `[{ op: 'if', cond: { cond: 'levelCompare', cmp: 'lt' }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `194` | Giga Hand | `support` | Discard 7 Cards from Online Deck. Own Attack Power is same as own HP. | `[{ op: 'mill', target: 'self', count: 7 }, { op: 'attackPower', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } }]` |
| `195` | Metallic Banana | `support` | Own HP are halved. Opponent's Attack Power becomes 0. | `[{ op: 'hp', target: 'self', mode: 'divide', value: 2 }, { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }]` |
| `196` | Shining Mane | `support` | If opponent's HP are more than 1000, opponent's HP are halved. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'gt', right: 1000 }, then: [{ op: 'hp', target: 'opponent', mode: 'divide', value: 2 }] }]` |
| `197` | Mega Rec. Floppy | `support` | Discard 7 Cards from own Online Deck. Recover own HP by +1000. | `[{ op: 'mill', target: 'self', count: 7 }, { op: 'hp', target: 'self', mode: 'add', value: 1000 }]` |
| `198` | Mega Attack Chip | `support` | Discard 7 Cards from own Online Deck. Boost own Attack Power +500. | `[{ op: 'mill', target: 'self', count: 7 }, { op: 'attackPower', target: 'self', mode: 'add', value: 500 }]` |
| `199` | Dark Lord's Cape | `support` | If opponent's HP is less than own, boost own Attack Power +400. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'lt', right: { ref: { stat: 'hp', who: 'self' } } }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }] }]` |
| `200` | Fake Sevens | `support` | None | `[{ op: 'none' }]` |
| `201` | Net Worm | `support` | If both players use same Attack, discard all Cards in foe's Hand. | `[{ op: 'if', cond: { cond: 'attacksSame' }, then: [{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }] }]` |
| `202` | Missile Pod | `support` | Discard all Cards in own Hand. Own Attack Power is doubled. | `[{ op: 'discardHand', target: 'self', count: 'all', selection: 'unspecified' }, { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }]` |
| `203` | Shogun's Order | `support` | Both players' Attack Power becomes 0. | `[{ op: 'attackPower', target: 'both', mode: 'set', value: 0 }]` |
| `204` | Beetle Diamond | `support` | Attack first. Boost own Attack Power +100. | `[{ op: 'attackFirst', target: 'self' }, { op: 'attackPower', target: 'self', mode: 'add', value: 100 }]` |
| `205` | Dark Bone | `support` | Own attack becomes "Eat-up HP." | `[{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }]` |
| `206` | Red Digivice | `support` | If own Specialty is Fire, boost own Attack Power +100, recover HP +200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }] }]` |
| `207` | Blue Digivice | `support` | If own Specialty is Ice, boost own Attack Power +100, recover HP +200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Ice'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }] }]` |
| `208` | Green Digivice | `support` | If own Specialty is Nature, boost own Attack Power +100, recover HP +200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Nature'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }] }]` |
| `209` | Black Digivice | `support` | If own Specialty is Darkness, boost own Attack Power +100, recover HP +200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Darkness'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }] }]` |
| `210` | Yellow Digivice | `support` | If own Specialty is Rare, boost own Attack Power +100, recover HP +200. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'self', in: ['Rare'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }, { op: 'hp', target: 'self', mode: 'add', value: 200 }] }]` |
| `211` | Pink Digivice | `support` | If Specialties are same, boost own Attack Power +200, recover HP +400. | `[{ op: 'if', cond: { cond: 'specialtiesSame' }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }, { op: 'hp', target: 'self', mode: 'add', value: 400 }] }]` |
| `212` | Another Dimension | `support` | Discard 7 Cards from both players' Online Decks. | `[{ op: 'mill', target: 'both', count: 7 }]` |
| `213` | UnInstall | `support` | If both Attacks are same, discard 7 Cards from foe's Online Deck. | `[{ op: 'if', cond: { cond: 'attacksSame' }, then: [{ op: 'mill', target: 'opponent', count: 7 }] }]` |
| `214` | Evil Program | `support` | Discard 1 Card in own DP Slot. Discard all foe's Cards in DP Slot. | `[{ op: 'discardDp', target: 'self', count: 1, from: 'top' }, { op: 'discardDp', target: 'opponent', count: 'all' }]` |
| `215` | Coliseum | `support` | Both players' attacks become `[[circle]]`. Boost own `[[circle]]` Attack Power +100. | `[{ op: 'forceAttack', target: 'both', to: 'circle' }, { op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 100 }]` |
| `216` | Fire Altar | `support` | Changes opponent's Specialty to Fire. Draw 1 Card from own Online Deck. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Fire' }, { op: 'draw', target: 'self', count: 1 }]` |
| `217` | Ice Altar | `support` | Changes opponent's Specialty to Ice. Draw 1 Card from own Online Deck. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Ice' }, { op: 'draw', target: 'self', count: 1 }]` |
| `218` | Nature Altar | `support` | Changes opponent's Specialty to Nature. Draw 1 Card from own Online Deck. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Nature' }, { op: 'draw', target: 'self', count: 1 }]` |
| `219` | Darkness Altar | `support` | Changes opponent's Specialty to Darkness. Draw 1 Card from own Online Deck. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Darkness' }, { op: 'draw', target: 'self', count: 1 }]` |
| `220` | Rare Altar | `support` | Changes opponent's Specialty to Rare. Draw 1 Card from own Online Deck. | `[{ op: 'setSpecialty', target: 'opponent', to: 'Rare' }, { op: 'draw', target: 'self', count: 1 }]` |
| `221` | Sup. Rec. Floppy | `support` | If own HP are less than foe's HP, recover own HP by +700. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'self' } }, cmp: 'lt', right: { ref: { stat: 'hp', who: 'opponent' } } }, then: [{ op: 'hp', target: 'self', mode: 'add', value: 700 }] }]` |
| `222` | Mega Def. Disk ○ | `support` | Opponent's `[[circle]]` Attack Power goes to 0. Recover own HP by +100. | `[{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }, { op: 'hp', target: 'self', mode: 'add', value: 100 }]` |
| `223` | Mega Def. Disk △ | `support` | Opponent's `[[triangle]]` Attack Power goes to 0. Recover own HP by +100. | `[{ op: 'attackPower', target: 'opponent', slot: 'triangle', mode: 'set', value: 0 }, { op: 'hp', target: 'self', mode: 'add', value: 100 }]` |
| `224` | Mega Def. Disk × | `support` | Opponent's `[[x]]` Attack Power goes to 0. Recover own HP by +100. | `[{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }, { op: 'hp', target: 'self', mode: 'add', value: 100 }]` |
| `225` | Heap of Junk | `support` | Opponent discards 2 Cards from his Online Deck and 1 Card from Hand. | `[{ op: 'mill', target: 'opponent', count: 2 }, { op: 'discardHand', target: 'opponent', count: 1, selection: 'unspecified' }]` |
| `226` | Beam Gun | `support` | Own Attack Power becomes 0. Opponent's HP are halved. | `[{ op: 'attackPower', target: 'self', mode: 'set', value: 0 }, { op: 'hp', target: 'opponent', mode: 'divide', value: 2 }]` |
| `227` | Chain Saw | `support` | Make own HP 10. Own Attack Power is tripled. | `[{ op: 'hp', target: 'self', mode: 'set', value: 10 }, { op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }]` |
| `228` | Metal Parts | `support` | Discard own Hand. Multiply own Attack Power by number of discarded Cards. | `[{ op: 'discardHand', target: 'self', count: 'all', selection: 'unspecified' }, { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } }]` |
| `229` | Metal Armor | `support` | Discard own DP Slot Cards. Multiply own Attack Power by number of discards. | `[{ op: 'discardDp', target: 'self', count: 'all' }, { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } }]` |
| `230` | Mega Hand | `support` | Own Attack Power matches own HP, then own HP are halved. | `[{ op: 'attackPower', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } }, { op: 'hp', target: 'self', mode: 'divide', value: 2 }]` |
| `231` | Level Balancer | `support` | If own Level is R, boost own Attack Power +400. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['R'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }] }]` |
| `232` | Level Manager | `support` | If own Level is C, boost own Attack Power +400. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['C'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }] }]` |
| `233` | Level Booster | `support` | If own Level is U, boost own Attack Power +400. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'self', in: ['U'] }, then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }] }]` |
| `234` | Armor Clash | `support` | If opponent is Level A, his Atk Pwr becomes 0 and own Atk Pwr is doubled. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'opponent', in: ['A'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }, { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `235` | Silver Ball | `support` | If opponent is Level U, his Atk Pwr becomes 0 and own Atk Pwr is doubled. | `[{ op: 'if', cond: { cond: 'levelIs', who: 'opponent', in: ['U'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }, { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `236` | Coral Charm | `support` | If foe's Specialty is Fire or Ice, his Attack Power goes to 0. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire', 'Ice'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `237` | Patch of Love | `support` | If foe's Specialty is Nature or Darkness, his Attack Power goes to 0. | `[{ op: 'if', cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature', 'Darkness'] }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `238` | Mystery Egg | `support` | Changes both players' Specialties to Rare. | `[{ op: 'setSpecialty', target: 'both', to: 'Rare' }]` |
| `239` | Miracle Ruby | `support` | KO'd Digimon revives with 1000. Battle is still lost. | `[{ op: 'reviveOnKo', target: 'self', hp: 1000 }]` |
| `240` | Cyber Parts | `support` | If both Attacks are same, own Attack Power is tripled. | `[{ op: 'if', cond: { cond: 'attacksSame' }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }] }]` |
| `241` | Liquid Crystal | `support` | If both players use same attack, opponent's Attack Power becomes 0. | `[{ op: 'if', cond: { cond: 'attacksSame' }, then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }] }]` |
| `242` | Deluxe Mushroom | `support` | If both players use same Attack, recover own HP +700. | `[{ op: 'if', cond: { cond: 'attacksSame' }, then: [{ op: 'hp', target: 'self', mode: 'add', value: 700 }] }]` |
| `243` | Lucky Mushroom | `support` | If both Attacks are different, recover own HP by +500. | `[{ op: 'if', cond: { cond: 'attacksDifferent' }, then: [{ op: 'hp', target: 'self', mode: 'add', value: 500 }] }]` |
| `244` | Premium Steak | `support` | Recover own HP by +500. Recover foe's HP by +200. | `[{ op: 'hp', target: 'self', mode: 'add', value: 500 }, { op: 'hp', target: 'opponent', mode: 'add', value: 200 }]` |
| `245` | Short Lance | `support` | If both attacks are different, own Attack Power is doubled. | `[{ op: 'if', cond: { cond: 'attacksDifferent' }, then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }] }]` |
| `246` | Med. Rec. Floppy | `support` | Own Attack Power is halved. Recover own HP by +500. | `[{ op: 'attackPower', target: 'self', mode: 'divide', value: 2 }, { op: 'hp', target: 'self', mode: 'add', value: 500 }]` |
| `247` | Digimon Analyzer | `support` | Move top 3 Cards from Offline Pile to Online Deck and shuffle. | `[{ op: 'recycleOffline', target: 'self', count: 3, shuffle: true }]` |
| `248` | Training Manual | `support` | Draw until there are 4 Cards in own Hand. Recover own HP by +100. | `[{ op: 'drawUntil', target: 'self', handSize: 4 }, { op: 'hp', target: 'self', mode: 'add', value: 100 }]` |
| `249` | Circle Hitter | `support` | If opponent uses `[[circle]]`, attack first and boost own Attack Power +500. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'opponent', in: ['circle'] }, then: [{ op: 'attackFirst', target: 'self' }, { op: 'attackPower', target: 'self', mode: 'add', value: 500 }] }]` |
| `250` | Triangle Hitter | `support` | If opponent uses `[[triangle]]`, attack first and boost own Attack Power +500. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'opponent', in: ['triangle'] }, then: [{ op: 'attackFirst', target: 'self' }, { op: 'attackPower', target: 'self', mode: 'add', value: 500 }] }]` |
| `251` | Cross Hitter | `support` | If opponent uses `[[x]]`, attack first and boost own Attack Power +500. | `[{ op: 'if', cond: { cond: 'attackIs', who: 'opponent', in: ['x'] }, then: [{ op: 'attackFirst', target: 'self' }, { op: 'attackPower', target: 'self', mode: 'add', value: 500 }] }]` |
| `252` | Suka's Curse | `support` | Opponent discards 2 Cards at random from his Hand. | `[{ op: 'discardHand', target: 'opponent', count: 2, selection: 'random' }]` |
| `253` | Cherrymon's Mist | `support` | Opponent's Support and Option Effects are voided. | `[{ op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' }]` |
| `254` | Hacking | `support` | If own Level is lower, switch HP with opponent. | `[{ op: 'if', cond: { cond: 'levelCompare', cmp: 'lt' }, then: [{ op: 'swapHp' }] }]` |
| `255` | Digimon Grave | `support` | Opponent discards 4 top Cards from Online Deck. | `[{ op: 'mill', target: 'opponent', count: 4 }]` |
| `256` | Data Copy | `support` | Own Attack Power, HP, and Specialty become same as the opponent's. | `[{ op: 'copyStats', from: 'opponent', stats: ['attackPower', 'hp', 'specialty'] }]` |
| `257` | Partner Finder | `support` | Pick Partner Card from own Online Deck at random and put in own Hand. | `[{ op: 'searchDeck', target: 'self', filter: { levels: ['R P'] }, count: 1, selection: 'random', to: 'hand', shuffleAfter: true }]` |
| `258` | Fire Spot | `support` | Change own Specialty to Fire. Boost own Attack Power +200. | `[{ op: 'setSpecialty', target: 'self', to: 'Fire' }, { op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `259` | Ice Crystal | `support` | Change own Specialty to Ice. Recover own HP by +200. | `[{ op: 'setSpecialty', target: 'self', to: 'Ice' }, { op: 'hp', target: 'self', mode: 'add', value: 200 }]` |
| `260` | Earth Charm | `support` | Change own Specialty to Nature. Attack first. | `[{ op: 'setSpecialty', target: 'self', to: 'Nature' }, { op: 'attackFirst', target: 'self' }]` |
| `261` | Black Gear | `support` | Change own Specialty to Darkness. Both players' HP are halved. | `[{ op: 'setSpecialty', target: 'self', to: 'Darkness' }, { op: 'hp', target: 'both', mode: 'divide', value: 2 }]` |
| `262` | Stuffed Animal | `support` | Change own Specialty to Rare. Opponent discards 1 Card at random. | `[{ op: 'setSpecialty', target: 'self', to: 'Rare' }, { op: 'discardHand', target: 'opponent', count: 1, selection: 'random' }]` |
| `263` | Disrupt Ray | `support` | Opponent's attack changes from `[[circle]]` to `[[triangle]]`, `[[triangle]]` to `[[x]]`, or `[[x]]` to `[[circle]]`. | `[{ op: 'rotateAttack', target: 'opponent', direction: 'forward' }]` |
| `264` | Attack Chip | `support` | Boost own Attack Power +300. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }]` |
| `265` | High Speed Disk | `support` | Randomly discard 1 Card from own Hand. Opponent's Attack Power is 0. | `[{ op: 'discardHand', target: 'self', count: 1, selection: 'random' }, { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }]` |
| `266` | Recovery Floppy | `support` | Recover own HP by +300. | `[{ op: 'hp', target: 'self', mode: 'add', value: 300 }]` |
| `267` | Attack Disk ○ | `support` | Own `[[circle]]` Attack Power is doubled. | `[{ op: 'attackPower', target: 'self', slot: 'circle', mode: 'multiply', value: 2 }]` |
| `268` | Attack Disk △ | `support` | Own `[[triangle]]` Attack Power is doubled. | `[{ op: 'attackPower', target: 'self', slot: 'triangle', mode: 'multiply', value: 2 }]` |
| `269` | Attack Disk × | `support` | Own `[[x]]` Attack Power is doubled. | `[{ op: 'attackPower', target: 'self', slot: 'x', mode: 'multiply', value: 2 }]` |
| `270` | Defense Disk ○ | `support` | Opponent's `[[circle]]` Attack Power is 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }]` |
| `271` | Defense Disk △ | `support` | Opponent's `[[triangle]]` Attack Power is 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'triangle', mode: 'set', value: 0 }]` |
| `272` | Defense Disk × | `support` | Opponent's `[[x]]` Attack Power is 0. | `[{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }]` |
| `273` | Digi-Garnet | `support` | Boost own Attack Power +100. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }]` |
| `274` | Digi-Amethyst | `support` | Recover own HP by +100. | `[{ op: 'hp', target: 'self', mode: 'add', value: 100 }]` |
| `275` | Digi-Aquamarine | `support` | KO'd Digimon revives with 100 HP. Battle is still lost. | `[{ op: 'reviveOnKo', target: 'self', hp: 100 }]` |
| `276` | Digi-Diamond | `support` | Draw 2 Cards from Online Deck. | `[{ op: 'draw', target: 'self', count: 2 }]` |
| `277` | Digi-Emerald | `support` | Change own Specialty to Nature. | `[{ op: 'setSpecialty', target: 'self', to: 'Nature' }]` |
| `278` | Digi-Pearl | `support` | Changes own Specialty to Rare. | `[{ op: 'setSpecialty', target: 'self', to: 'Rare' }]` |
| `279` | Digi-Ruby | `support` | Changes own Specialty to Fire. | `[{ op: 'setSpecialty', target: 'self', to: 'Fire' }]` |
| `280` | Digi-Sardnyx | `support` | Change own Specialty to Darkness. | `[{ op: 'setSpecialty', target: 'self', to: 'Darkness' }]` |
| `281` | Digi-Sapphire | `support` | Change own Specialty to Ice. | `[{ op: 'setSpecialty', target: 'self', to: 'Ice' }]` |
| `282` | Digi-Opal | `support` | Own attack becomes `[[circle]]`. | `[{ op: 'forceAttack', target: 'self', to: 'circle' }]` |
| `283` | Digi-Topaz | `support` | Own attack becomes `[[triangle]]`. | `[{ op: 'forceAttack', target: 'self', to: 'triangle' }]` |
| `284` | Digi-Turquoise | `support` | Own attack becomes `[[x]]`. | `[{ op: 'forceAttack', target: 'self', to: 'x' }]` |
| `285` | Wild Sevens | `support` | Own Attack Power is tripled. | `[{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }]` |
| `286` | Holy Sevens | `support` | Recover own HP by +1000. | `[{ op: 'hp', target: 'self', mode: 'add', value: 1000 }]` |
| `287` | Dark Sevens | `support` | If opponent's HP are lower then own, opponent's HP become 10. | `[{ op: 'if', cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'lt', right: { ref: { stat: 'hp', who: 'self' } } }, then: [{ op: 'hp', target: 'opponent', mode: 'set', value: 10 }] }]` |
| `288` | Grand Sevens | `support` | Own Attack Power is boosted by the number of own HP. | `[{ op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'hp', who: 'self' } } }]` |
| `289` | Mystic Sevens | `support` | Opponent's Support and Option Effects are voided. His Attack Power is 0. | `[{ op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' }, { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }]` |
| `290` | Speed Sevens | `support` | Attack first. Own attack becomes "Eat-up HP." Boost Attack Power +200. | `[{ op: 'attackFirst', target: 'self' }, { op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }, { op: 'attackPower', target: 'self', mode: 'add', value: 200 }]` |
| `291` | Reverse Sevens | `support` | Move top 10 Cards from Offline Pile to Online Deck, then shuffle. | `[{ op: 'recycleOffline', target: 'self', count: 10, shuffle: true }]` |
| `292` | Rosemon's Lure | `support` | Opponent discards his Hand and all Cards in his DP Slot. | `[{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }, { op: 'discardDp', target: 'opponent', count: 'all' }]` |
| `293` | Download Digivolve | `digivolvePhase` | Can digivolve regardless of own Specialty, Level, or Digivolve Pts. | `[{ op: 'digivolveModifier', ignoreSpecialty: true, ignoreLevel: true, ignoreDp: true }]` |
| `294` | ArmorCrush Digivolve | `digivolvePhase` | Digivolve a Level A Digimon to C or U. (DP are needed.) | `[{ op: 'digivolveModifier', requireFromLevels: ['A'], allowedToLevels: ['C', 'U'] }]` |
| `295` | Special Digivolve | `digivolvePhase` | Can digivolve regardless of own Specialty by adding DP +20. | `[{ op: 'digivolveModifier', ignoreSpecialty: true, extraDp: 20 }]` |
| `296` | Mutant Digivolve | `digivolvePhase` | Can digivolve Digimon at same Level. (Need DP) (Ignore Specialty) | `[{ op: 'digivolveModifier', allowSameLevel: true, ignoreSpecialty: true }]` |
| `297` | Warp Digivolve | `digivolvePhase` | Can digivolve from R to U. (DP are needed.) | `[{ op: 'digivolveModifier', allowSkipLevel: true, requireFromLevels: ['R', 'R P'], allowedToLevels: ['U'] }]` |
| `298` | De-Armor Digivolve | `digivolvePhase` | Downgrade a Level A Digimon to Level R. | `[{ op: 'devolve', target: 'self', levels: 1, requireFromLevels: ['A'], toLevel: 'R' }]` |
| `299` | Speed Digivolve | `digivolvePhase` | Can disregard DP in digivolving. (Not possible in Abnormal states) | `[{ op: 'digivolveModifier', ignoreDp: true, notInAbnormal: true }]` |
| `300` | Digi-devolve | `digivolvePhase` | DownGrade own digivolution by 1 Level. HP double when successful. | `[{ op: 'devolve', target: 'self', levels: 1, requireFromLevels: ['C', 'U'], onSuccess: [{ op: 'hp', target: 'self', mode: 'multiply', value: 2 }] }]` |
