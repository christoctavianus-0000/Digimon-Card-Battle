---
name: obsidian-second-brain
description: Read and update the shared Obsidian Second Brain vault at D:\My AI Project\Agent_Second_Brain across Mini Game and Game Guide projects. Use when onboarding onto a project, recording architectural decisions or completed milestones, capturing daily progress logs, or syncing project MOCs and roadmaps.
---

# Obsidian Second Brain Sync Skill

Integrate Antigravity sessions with the shared cross-project vault at `D:\My AI Project\Agent_Second_Brain\`.

## Vault Structure & Key Entry Points
- `00 - Home.md` — Master dashboard linking active projects, Areas/MOCs, essential guides, and recent Daily Notes.
- `03 - Areas/` — Maps of Content (MOCs):
  - `Mini Game MOC.md` → `Digimon Digital Card Battle (Mini Game) MOC.md`, `Bravely Default II - BnD Card Game MOC.md`
  - `Game Guide MOC.md` → `Digimon Digital Card Battle MOC.md`, `Bravely Default II MOC.md`, `Octopath Traveler 0 MOC.md`
  - `AI & Agent Engineering MOC.md`
- `02 - Projects/` — Roadmaps & backlogs (`Mini Game Roadmap & Backlog.md`, `Game Guide Roadmap & Backlog.md`).
- `01 - Daily Notes/` — Chronological work logs (`YYYY-MM-DD.md`).
- `04 - Resources/` — Cross-project architecture notes (`How to Use This Second Brain.md`, `Game Guide Shared Architecture & Invariants.md`).
- `99 - Meta/` — Templates (`99 - Meta/Templates/`) and Obsidian Bases tracker (`99 - Meta/Bases/Second Brain Tracker.base`).

## Workflow
1. **Before Coding (Orient):** Read `00 - Home.md` or the target project's MOC (`03 - Areas/...`) and roadmap (`02 - Projects/...`) to reuse existing decisions, file maps, and invariants.
2. **Match Vault Conventions & YAML Frontmatter:**
   - **MOCs (`03 - Areas/`):** `created`, `up: "[[Mini Game MOC]]"` (or `"[[00 - Home]]"`), `game`, `tags` (`type/moc`, `domain/mini-game` or `domain/game-guide`, `game/...`).
   - **Projects (`02 - Projects/`):** `created`, `status: active`, `deadline: ""`, `area: "[[Mini Game MOC]]"`, `game`, `tags` (`type/project`, `domain/mini-game`, `status/active`).
   - **Daily Notes (`01 - Daily Notes/YYYY-MM-DD.md`):** `created`, `tags` (`type/daily`, plus domain tag if focused), backlink `← [[00 - Home|🏠 Home Dashboard]]`.
3. **After Completing Meaningful Work (Sync):**
   - Append concise bullets to today's Daily Note (`01 - Daily Notes/YYYY-MM-DD.md`), creating it from `99 - Meta/Templates/Daily Note Template.md` structure if missing and linking it under `Recent Daily Notes` in `00 - Home.md`.
   - Update the relevant MOC (`03 - Areas/...`) if modules, invariants, test counts, or deployment URLs changed.
   - Check off or add tasks in `02 - Projects/Mini Game Roadmap & Backlog.md`.
   - Verify `[[Wikilinks]]` and `domain/mini-game` tags align with `99 - Meta/Bases/Second Brain Tracker.base`.
4. **Report Transparently:** Include a `🧠 Second Brain Sync` section in the final reply listing every Obsidian file consulted or updated with clickable `file://` links.

## Guardrails
- Never invent unverified metrics, file paths, or test results in vault notes.
- Only edit Obsidian files relevant to the current task; read target ranges before editing existing notes.
