# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ViniTokx is a Turborepo monorepo using **Bun** as the package manager. It provides token analysis and optimization tooling for AI coding assistants, starting with a Claude Code plugin.

## Commands

All commands run from the repo root unless noted.

```sh
bun install                                # Install dependencies
turbo build                                # Build all packages (compiles core + observer → dist/)
turbo lint                                 # Lint all workspaces
turbo check-types                          # Type-check all workspaces
bun run format                             # Prettier format all TS/MD files
turbo build --filter=@vinitokx/observer    # Build just the CLI
node packages/observer/dist/cli.js analyze # Run the analyzer (zero LLM cost)
```

## Architecture

**Monorepo layout:**
- `apps/claude` — Claude Code plugin (`@vinitokx/claude`); commands + skills + hooks, no build step
- `apps/cursor` — Cursor IDE plugin placeholder (`@vinitokx/cursor`); no code yet
- `apps/codex` — OpenAI Codex plugin placeholder (`@vinitokx/codex`); no code yet
- `packages/core` — Token estimation engine (`@vinitokx/core`); heuristic char-based estimation for live conversation
- `packages/observer` — Offline transcript analyzer (`@vinitokx/observer`); reads `~/.claude/projects/*.jsonl` for exact per-tool/per-model token reports. Ships the `vinitokx` CLI binary.
- `packages/eslint-config` — Shared ESLint configs (`@vinitokx/eslint-config`)
- `packages/typescript-config` — Shared tsconfig presets (`@vinitokx/typescript-config`)

**Build pattern (core, observer):** Source in `src/`, output in `dist/`. Two tsconfigs: `tsconfig.json` (`noEmit` for IDE/check-types) and `tsconfig.build.json` (emits to dist). NodeNext module resolution — all relative imports within `src/` must use `.js` extensions.

**apps/claude plugin structure:**
- `.claude-plugin/plugin.json` — Claude Code plugin metadata
- `commands/<name>.md` — slash commands (`/token-analyze`, `/token-stats`) that shell out to the `vinitokx` CLI
- `skills/<name>/SKILL.md` — auto-firing LLM-driven skills (`token-optimize` only — needs semantic reasoning)
- `hooks/hooks.json` — hook definitions (empty by default; opt-in PostToolUse hook documented in `packages/observer/README.md`)

**Why some are commands and others are skills:** Token analysis and stats are mechanical (read transcripts, tabulate) — they belong in the CLI and are exposed as slash commands. Token optimization needs semantic LLM reasoning — it stays a skill. This separation keeps passive context cost low (commands don't preload).

**Task graph:**
- `build` — `packages/core` and `packages/observer` have build scripts; others skipped
- `check-types` / `lint` — run in core and observer
- `test` — independent per package (no cross-dep ordering)
- `publish` — depends on build + check-types + lint, never cached

## Zero-token analyzer

The `vinitokx` CLI in `packages/observer` is a hard requirement: it must read existing transcripts only and never invoke the LLM. When changing it, preserve:
- Zero runtime dependencies
- Streaming JSONL parser (don't load whole files)
- Defensive parsing (malformed lines increment a counter, never throw)
- Exact per-model figures, approximate per-tool figures (turn-level equal-split)
