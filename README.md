# Digimon Digital Card Battle (PS1 — 1:1 Web Edition)

A faithful, self-contained 1:1 web recreation of the tactical card battle system from **Digimon Digital Card Battle** (*Digimon World: Digital Card Arena* on PlayStation 1), built with **React 18**, **TypeScript**, **Vite 5**, and **Vitest**.

All **301 canonical cards (#000–#300)** and all **138 canonical GameFAQs opponent & starter decks** are unlocked from the start, with a full Effect DSL interpreter, 3-tier fair-information AI opponents, full Deck Builder with import/export, Card Codex Binder, and a procedural Web Audio API sound synthesizer.

---

## Key Features

### 1. Complete 301-Card Catalog (`#000`–`#300`)
- **191 Digimon Cards (`#000`–`#190`)**:
  - **Fire** (`#000`–`#039`), **Ice** (`#040`–`#074`), **Nature** (`#075`–`#109`), **Darkness** (`#110`–`#146`), **Rare** (`#147`–`#171`), and **Partner & Armor** (`#172`–`#190`).
  - Levels: **R** (Rookie), **R P** (Rookie Partner), **C** (Champion), **U** (Ultimate), and **A** (Armor).
  - Full printed stats (`HP`, `DP`, `+P`), `Circle (○)`, `Triangle (△)`, and `Cross (✕)` attacks, printed `✕` special abilities, and Support effects.
- **110 Option Cards (`#191`–`#300`)**:
  - **Battle Support Option Cards (`#191`–`#292`)**: Played into the Support Slot during combat to buff attack power, heal HP, void enemy support/options, force attack symbols, change Specialties, or manipulate zones.
  - **Digivolve Phase Option Cards (`#293`–`#300`)**: *Download Digivolve*, *ArmorCrush Digivolve*, *Special Digivolve*, *Mutant Digivolve*, *Warp Digivolve*, *De-Armor Digivolve*, *Speed Digivolve*, and *Digi-devolve*.

### 2. 138 Canonical Opponent & Base Decks
- Parsed directly from the canonical GameFAQs *Base Deck List* (`docs/base-deck-list..txt`).
- Includes all **138 duelist decks** across Beginner City, Flame City, Jungle City, Igloo City, Junk City, Dark City, Sky City, Wiseman Tower, and Infinity Tower (Betamon, Agumon, Veemon, Wormmon, Myotismon, VenomMyotismon, Apokarimon, Analogman's fixed-order *Darkness Wave Deck*, Rosemon, Seraphimon, Diaboromon, and more).
- Curated **26 Starter & Partner Preset Decks** for instant one-click loading in the Deck Builder.
- Categorized into **Easy**, **Normal**, **Hard**, and **Expert** tiers, with Arena Location & Completion Status filters (`X/138 Defeated`), special-rule badges (`FIXED DECK ORDER`, `NO ARMOR DIGIVOLVE`), Partner `armorInfo` previews, and per-opponent win/loss/streak tracking persisted in `localStorage`.

### 3. 1:1 PS1 Battle Engine (`src/engine/`)
- **Zones**: Online Deck (30 cards), Hand (drawn up to 4 cards), Active Digimon Battle Slot (with full Digivolution Stack underneath), DP Slot (persists across KOs!), Support Slot, Offline Pile, and 3-KO Scoreboard.
- **Turn Structure**:
  1. **Initial Setup & Mulligan**: Shuffle 30-card decks, draw 4 cards, optional 1-time Mulligan redraw (with automatic Rookie guarantee), and place initial Level `R` / `R P` Rookie.
  2. **Preparation Phase (Turn Player, then Second Player)**:
     - Draw from Online Deck up to 4 cards in Hand (with PS1 **Deck-Out** and **Post-KO Rookie Dry-Hand Forced Redraw** rules).
     - Sacrifice up to **1 Digimon card per turn** from Hand into the **DP Slot** to accumulate `+P` points.
     - Play Digivolve-phase Option cards (`#293`–`#300`).
     - **Normal Digivolve (`R → C → U`)**: Matches Specialty, requires `dpTotal >= target.dp`, consumes DP Slot to Offline, stacks on top of active Digimon, and resets HP to the new form's printed HP.
     - **Armor Digivolve (`R P → A`)**: Follows canonical Digi-Egg Partner lineages (`Veemon`, `Hawkmon`, `Patamon`, `Gatomon`, `Wormmon`, `Armadillomon`), costs **0 DP**, and **preserves all cards in the DP Slot**.
  3. **Shared Battle Phase**:
     - Both players secretly lock in `Circle (○)`, `Triangle (△)`, or `Cross (✕)`.
     - Both players play a Support card from Hand, **Blind Support** from the top of their Online Deck, or Pass.
     - Support & Option effects resolve in canonical priority order (Void/Cancel effects first, then stat/attack/ability modifiers), followed by First Attacker and Second Attacker combat resolution.
- **Complete X-Attack Special Abilities**:
  - `[[circle]]` / `[[triangle]]` / `[[x]] Counter` (reflects `2 × Opponent Attack Power + Own Attack Power` when attacking second and surviving)
  - `[[circle]]` / `[[triangle]]` / `[[x]] to 0` (nullifies opponent's attack power if matching symbol)
  - `1st Attack` (overrides default turn attack priority)
  - `Eat-Up HP` (heals own HP equal to combat damage dealt, uncapped above printed max HP)
  - `Crash` (adds current HP to attack power and reduces own HP to `10`)
  - `Jamming` (nullifies opponent's printed X-attack special ability)
  - `[Specialty] Foe ×3` (triples Cross attack power against matching Specialty)

### 4. Fair-Information AI Opponents (`src/ai/`)
- Strictly operates on `getVisibleState(state, side)` — never peeks at the player's hidden hand, Online Deck order, or unrevealed attack selection.
- **Easy AI**: Casual duelist with weighted attack choices and light preparation heuristics.
- **Normal AI**: Tactical duelist that plans DP accumulation toward Champion/Ultimate evolutions in hand and evaluates expected combat trades.
- **Hard AI**: Master lookahead duelist that computes full `3 × 3` Circle/Triangle/Cross payoff matrices (accounting for Counter traps, Attack-to-0, Foe ×3, Crash, Eat-Up HP, and Support cards) to maximize KO probability and survival.

### 5. Deck Builder, Card Codex, Battle UX & Procedural Web Audio (`src/components/`, `src/audio/`)
- **Deck Builder**: Manage multiple saved 30-card decks, enforce PS1 copy limits (max 4 per standard card, max 1 per Partner `R P`, max 3 total Partners, ≥1 Rookie), view live Specialty & Level curves, use the **Specialty Auto-Fill** picker and **4-Card Opening Hand Simulator**, load any of the 138 canonical base decks, and import/export shareable `DDCB1:...` deck codes or JSON.
- **Battle Screen & Arena UX**: Supports keyboard shortcuts (`1`/`2`/`3` attacks & slots, `Space`/`Enter` confirm, `L` log drawer, `Esc` close/cancel), one-click **Copy Log** export, active Option target highlighting with effective DP cost previews, and strict visible-state masking (`getVisibleState`).
- **Card Codex (Binder)**: Browse all 301 cards in Grid or Matrix Table views, filter by Specialty/Level/Text/X-Effect, sort by any stat, and inspect full card modals with Partner ↔ Armor lineage links.
- **Procedural Sound Engine**: Zero-asset Web Audio API synthesizer generating PS1 Digivice clicks, card draws, DP charges, Digivolution arpeggios, Armor crest chimes, laser/heavy hits, Counter alarms, KO explosions, and Victory/Defeat fanfares.

### 6. Quality Assurance & Bundle Optimization
- **Automated Test Suite (`npx vitest run`)**: **8 test files / 95 tests** covering card & opponent parsing, rules invariants (`bugfixes.test.ts`), Substep 3B `voidSupport` isolation, `notInAbnormal` checks, AI-vs-AI simulations (`Hard` vs `Easy`), and `localStorage` persistence.
- **Code-Splitting (`vite.config.ts` & `src/App.tsx`)**: Routes heavy sub-views via `React.lazy` + `Suspense` with `manualChunks` (`vendor-react`, `vendor-icons`, `data-decks`, `data-cards`), keeping production bundles clean with zero `> 500 kB` chunk warnings.

---

## Getting Started

```bash
# Install dependencies
npm install

# Run unit & integration test suite (Vitest)
npm test

# Start local development server
npm run dev

# Type-check and build production bundle
npm run build
```

### Regenerating Card Data from Reference Guide (Optional)
All generated card definitions (`src/data/cards.generated.ts`), canonical decks (`src/data/decks.generated.ts`), and card/UI assets (`public/assets/`) are committed to the repository. To re-import from the local HTML guide:

```bash
npm run import:cards
```
