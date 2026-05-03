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
- `packages/router` — Rust binary `vtkxoptm` (`@vinitokx/router`); routes four small LLM tasks (summarize, docstring, classify, boilerplate) to a local Ollama model so the cloud LLM never reads heavy input. Built via `cargo build --release`; turbo wraps it.
- `packages/eslint-config` — Shared ESLint configs (`@vinitokx/eslint-config`)
- `packages/typescript-config` — Shared tsconfig presets (`@vinitokx/typescript-config`)

**Build pattern (core, observer):** Source in `src/`, output in `dist/`. Two tsconfigs: `tsconfig.json` (`noEmit` for IDE/check-types) and `tsconfig.build.json` (emits to dist). NodeNext module resolution — all relative imports within `src/` must use `.js` extensions.

**apps/claude plugin structure:**
- `.claude-plugin/plugin.json` — Claude Code plugin metadata
- `commands/<name>.md` — slash commands (`/token-analyze`, `/token-stats`) that shell out to the `vinitokx` CLI
- `skills/<name>/SKILL.md` — auto-firing LLM-driven skills (`token-optimize` only — needs semantic reasoning)
- `agents/<name>.md` — auto-routing subagents. `local-llm-runner` delegates summarize/docstring/classify/boilerplate to `vtkxoptm` so the heavy input stays out of every cloud LLM session.
- `hooks/hooks.json` — hook definitions. SessionStart hook calls `vtkxoptm warm &` (no-op if `vtkxoptm` is not on PATH) so the local model is preloaded.

**Why some are commands and others are skills:** Token analysis and stats are mechanical (read transcripts, tabulate) — they belong in the CLI and are exposed as slash commands. Token optimization needs semantic LLM reasoning — it stays a skill. This separation keeps passive context cost low (commands don't preload).

**Task graph:**
- `build` — `packages/core` and `packages/observer` build with `tsc`; `packages/router` builds with `cargo build --release` and symlinks the resulting binary into `node_modules/.bin/vtkxoptm`
- `check-types` / `lint` — `tsc --noEmit` / `eslint` for TS packages; `cargo check` / `cargo clippy` for `packages/router`
- `test` — independent per package (no cross-dep ordering)
- `publish` — depends on build + check-types + lint, never cached

## Zero-token analyzer

The `vinitokx` CLI in `packages/observer` is a hard requirement: it must read existing transcripts only and never invoke the LLM. When changing it, preserve:
- Zero runtime dependencies
- Streaming JSONL parser (don't load whole files)
- Defensive parsing (malformed lines increment a counter, never throw)
- Exact per-model figures, approximate per-tool figures (turn-level equal-split)

## Local-LLM router (`vtkxoptm`)

The Rust binary at `packages/router` saves cloud tokens by routing four narrow tasks (summarize, docstring, classify, boilerplate) to a local Ollama model picked once at setup time via [`AlexsJones/llmfit`](https://github.com/AlexsJones/llmfit). The savings only hold if the heavy input never enters a cloud LLM session — so when working on this code, preserve:

- The subagent (`apps/claude/agents/local-llm-runner.md`) has only the `Bash` tool; never give it `Read`. The local CLI must be the only thing that opens the input file.
- `vtkxoptm run` always prints the post-processed model output on stdout and appends one line to `~/.config/vinitokx/router-savings.jsonl` — these are the contract for the subagent and the `gain` dashboard.
- Defensive JSONL reader for the savings ledger: malformed lines increment a counter, never throw (mirrors the observer's parser invariant).
- The CLI is a one-shot: no daemon, no async runtime, no streaming in v1. Ollama is the long-lived process.

First-time setup: `cd packages/router && cargo build --release`, link the binary onto `PATH` (`ln -sf "$PWD/target/release/vtkxoptm" ~/.local/bin/vtkxoptm`), then run `vtkxoptm setup` once to pick a model. After that, the SessionStart hook keeps it warm.
