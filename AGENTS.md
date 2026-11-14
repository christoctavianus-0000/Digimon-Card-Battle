# AGENTS.md — Digimon Digital Card Battle (PS1 1:1 Recreation)

Project root: `d:\My AI Project\Mini Game\Digimon Card Battle\`  
Parent workspace rules: `d:\My AI Project\Mini Game\AGENTS.md`

---

## 📚 Project Scope & Reference Sources
- **Goal:** Faithful 1:1 PS1 *Digimon Digital Card Battle* **card duel** web app — Deck Builder, all 301 cards unlocked from the start (no Story progression / no Fusion grind), 138 GameFAQs canonical opponents, 3-tier AI (`Easy`, `Normal`, `Hard`), procedural Web Audio SFX.
- **Reference Data:**
  - `D:\My AI Project\Game Guide\Digimon Card Battle\allCards.json` + card/UI artwork (imported via `scripts/import-cards.mjs` / `npm.cmd run import:cards`)
  - `docs/base-deck-list..txt` (138 canonical opponent decks + 26 starter/preset decks)
  - `docs/RULES.md` & `docs/EFFECT_DSL.md` (rules specification & declarative Effect DSL)

---

## 🧱 Architecture & Non-Negotiable Invariants
1. **Types & Effect DSL (`src/types/game.ts`, `src/types/effects.ts`):**
   - `MatchState` is immutable; engine transitions are pure functions with injectable RNG (`src/engine/rng.ts`).
   - All 301 card effects live declaratively in `src/data/effects/` (`fire-ice.ts`, `nature-dark-rare.ts`, `option.ts`, `index.ts`). Keep coverage at 100% with zero `unimplemented` ops.
2. **Engine Rules (`src/engine/match.ts`, `src/engine/battle.ts`, `src/engine/effectInterpreter.ts`):**
   - `getVisibleState` MUST sanitize hidden opponent information (hand card identities, hidden facedown support/deck order) before returning state to UI or AI.
   - `RulesConfig` MUST honor opponent deck flags: `preserveDeckOrder` (`preserveExactOrder` for fixed-order decks like Analogman's *Darkness Wave Deck*) and `disableArmorOnCardIds` (`--- no armor` / `[no armor]`), plus forward `armorInfo` from `OpponentDef` / `BaseDeckDef` (`src/data/opponents.ts`).
   - Isolate `voidSupport` within Substep 3B resolution (`battle.ts` & `effectInterpreter.ts`) so temporary support negation does not leak outside its intended timing window.
   - Guard Option card eligibility strictly via `canUseDigivolveOptionCard` and status checks such as `notInAbnormal` (e.g., `#299 Speed Digivolve`).
3. **AI (`src/ai/easy.ts`, `src/ai/normal.ts`, `src/ai/hard.ts`):**
   - Never bypass `getVisibleState`. Validate changes against `src/ai/__tests__/ai.test.ts` and `src/engine/__tests__/qa_simulation.test.ts`.
4. **UI, Persistence & Bundle Splitting (`src/components/`, `src/state/deckStore.ts`, `vite.config.ts`, `src/App.tsx`):**
   - Persist only saved decks, active deck selection, and per-opponent W/L/streak records in `localStorage`.
   - Maintain code-splitting (`React.lazy`/`Suspense` in `src/App.tsx` + `manualChunks` in `vite.config.ts` for `vendor-react`, `vendor-icons`, `data-decks`, `data-cards`) so Vite builds without `> 500 kB` chunk warnings.
   - Maintain Vite `base: './'` for GitHub Pages compatibility (`.github/workflows/deploy.yml`).

---

## ✅ Required Verification After Any Code Change
Run in `d:\My AI Project\Mini Game\Digimon Card Battle\` via PowerShell:
```powershell
npx.cmd tsc --noEmit; if ($LASTEXITCODE -eq 0) { npx.cmd vitest run }; if ($LASTEXITCODE -eq 0) { npm.cmd run build }
```

---

## 🧠 Second Brain Sync
- Project MOC: `D:\My AI Project\Agent_Second_Brain\03 - Areas\Digimon Digital Card Battle (Mini Game) MOC.md`
- Game Guide Reference MOC: `D:\My AI Project\Agent_Second_Brain\03 - Areas\Digimon Digital Card Battle MOC.md`
- Roadmap: `D:\My AI Project\Agent_Second_Brain\02 - Projects\Mini Game Roadmap & Backlog.md`
- Daily Log: `D:\My AI Project\Agent_Second_Brain\01 - Daily Notes\YYYY-MM-DD.md`
- End user responses with `🧠 Second Brain Sync` listing Obsidian notes consulted/updated.
