---
name: digimon-card-battle-dev
description: Architecture, PS1 rules invariants, Effect DSL workflow, AI testing, and bundle/build verification guide for Digimon Digital Card Battle (d:\My AI Project\Mini Game\Digimon Card Battle). Use when modifying battle mechanics, adding or fixing card effects, adjusting AI heuristics, editing opponent base decks, or building and deploying to GitHub Pages.
---

# Digimon Card Battle Developer Skill

Project root: `d:\My AI Project\Mini Game\Digimon Card Battle\`

## Codebase Map
- `docs/RULES.md` — PS1 turn sequence, DP/Digivolution/Armor rules, KO & HP resolution.
- `docs/EFFECT_DSL.md` & `src/types/effects.ts` — Declarative Effect DSL schema.
- `docs/base-deck-list..txt` — Canonical GameFAQs list (138 opponent decks + starter/preset notes).
- `scripts/import-cards.mjs` — Imports card data/artwork from `D:\My AI Project\Game Guide\Digimon Card Battle\allCards.json` (`npm.cmd run import:cards`).
- `src/data/` — `cards.generated.ts`, `cards.ts`, `digiParts.ts`, `decks.generated.ts`, `opponents.ts`, `effects/{fire-ice,nature-dark-rare,option,index}.ts`.
- `src/engine/` — Pure immutable engine (`match.ts`, `battle.ts`, `effectInterpreter.ts`, `rng.ts`, `index.ts`).
- `src/ai/` — `easy.ts`, `normal.ts`, `hard.ts`, `index.ts` (consumes `getVisibleState` + `getEffectiveCardData` / `resolveCardEffectDef` + `statPenaltyDivisor`).
- `src/components/` — `BattleScreen.tsx`, `battle/BattleField.tsx`, `DeckBuilder.tsx`, `PartnerEditor.tsx`, `OpponentSelect.tsx`, `CardBinder.tsx`, `CardView.tsx`, `CardDetailModal.tsx`.
- `src/state/deckStore.ts` & `src/audio/soundEngine.ts` — `localStorage` persistence (`partnerConfigs`, saved decks, W/L records) & procedural Web Audio SFX.
- `vite.config.ts` — `base: './'`, `manualChunks` (`vendor-react`, `vendor-icons`, `data-decks`, `data-cards`), Vitest Node test environment.

## Critical Engine & UI Invariants
1. **PS1 Open Hands & Secret Battle Selections:** Always route UI and AI observations through `getVisibleState` (`src/engine/match.ts`). Both 4-card hands are open face-up, while `online` deck order and opponent `chosenAttacks`, `effectiveAttacks`, `computedPowers`, `supportCards`, blind deck-top cards, and unrevealed events remain hidden across **both** `attackSelect` and `supportSelect` until both sides finish Support (reconstructing any unrevealed Support-from-hand card back into `hand`). Revealed clash info is persisted on `MatchState.lastBattle` for Clash Reveal banners and Battle Logs.
2. **Partner Digi-Parts & Canonical Opponent Constraints:** `getEffectiveCardData` applies equipped Digi-Parts (`#000`–`#127`) strictly to Partner Rookies (`R P`); Armor forms (`A`) keep their fixed printed stats. Preserve `RulesConfig.preserveDeckOrder` (`preserveExactOrder`), `RulesConfig.disableArmorOnCardIds`, `config.partnerConfig.opponent` mapped via `ARMOR_TO_PARTNER_ID[opponent.armorCardId]`, and `armorInfo` forwarding from `src/data/opponents.ts` through `src/App.tsx`.
3. **Substep 3B `voidSupport` & `Jamming` Isolation:** Support negation stays scoped to Substep 3B (`battle.ts` & `effectInterpreter.ts`), and `Jamming` disables only printed `xEffect` abilities while leaving Support-granted abilities (e.g., `#191 Golden Banana` Counter) active.
4. **Option Card Timing, Status Guards & React Purity:** Keep `canUseDigivolveOptionCard` and `notInAbnormal` guards (e.g., `#299 Speed Digivolve`) enforced in `match.ts`, keep `BattleScreen.tsx` `dispatchAction` side effects (`setBattleLogs`, `setClashBanners`) outside `setMatchState` functional updaters (React StrictMode safety), and verify changes with `src/engine/__tests__/bugfixes.test.ts` and `engine.test.ts`.
5. **Bundle Performance:** Keep `React.lazy` / `Suspense` routes in `src/App.tsx` and `manualChunks` in `vite.config.ts` so production builds emit zero `> 500 kB` chunk warnings.

## Verification & Deployment Workflow (Windows PowerShell)
Run after any code, effect, data, or config change:
```powershell
cd "d:\My AI Project\Mini Game\Digimon Card Battle"
npx.cmd tsc --noEmit; if ($LASTEXITCODE -eq 0) { npx.cmd vitest run }; if ($LASTEXITCODE -eq 0) { npm.cmd run build }
```
- **Regression Suites:** `src/engine/__tests__/bugfixes.test.ts`, `engine.test.ts`, `qa_simulation.test.ts`, `src/ai/__tests__/ai.test.ts`, `src/data/effects/__tests__/effects.test.ts`, `src/data/__tests__/{cards,opponents}.test.ts`, `src/state/__tests__/deckStore.test.ts`.
- **GitHub Pages:** `.github/workflows/deploy.yml` runs `npm ci`, `npm test`, and `npm run build` on push to `main`/`master` and deploys `./dist`. Before running `git push`, confirm `git remote -v` has an existing GitHub repository configured.
