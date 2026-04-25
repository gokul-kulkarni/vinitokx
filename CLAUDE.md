# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ViniTokx is a Turborepo monorepo using **Bun** as the package manager. It provides token analysis and optimization tooling for AI coding assistants, starting with a Claude Code plugin.

## Commands

All commands run from the repo root unless noted.

```sh
bun install                              # Install dependencies
turbo build                              # Build all packages (compiles packages/core → dist/)
turbo lint                               # Lint all workspaces
turbo check-types                        # Type-check all workspaces
bun run format                           # Prettier format all TS/MD files
turbo build --filter=@vinitokx/core      # Build only packages/core
turbo check-types --filter=@vinitokx/core
```

## Architecture

**Monorepo layout:**
- `apps/claude` — Claude Code plugin (`@vinitokx/claude`); skills and hooks only — no build step
- `apps/cursor` — Cursor IDE plugin placeholder (`@vinitokx/cursor`); no code yet
- `apps/codex` — OpenAI Codex plugin placeholder (`@vinitokx/codex`); no code yet
- `packages/core` — Token analysis engine (`@vinitokx/core`); TypeScript, builds to `dist/` via tsc
- `packages/eslint-config` — Shared ESLint configs (`@vinitokx/eslint-config`)
- `packages/typescript-config` — Shared tsconfig presets (`@vinitokx/typescript-config`)

**packages/core:** Source in `src/`, output in `dist/`. Must be built before any package that imports it. Uses NodeNext module resolution — all relative imports within `src/` must use `.js` extensions.

**apps/claude plugin structure:**
- `.claude-plugin/plugin.json` — Claude Code plugin metadata
- `skills/<name>/SKILL.md` — one subdirectory per skill
- `hooks/hooks.json` — hook definitions (empty for now)

**Task graph:**
- `build` — only `packages/core` has a build script; others skipped
- `check-types` / `lint` — run in `packages/core`
- `test` — independent per package (no cross-dep ordering)
- `publish` — depends on build + check-types + lint, never cached
