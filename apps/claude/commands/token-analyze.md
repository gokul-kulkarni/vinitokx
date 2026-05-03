---
description: Show a detailed token consumption report from local Claude Code transcripts (zero LLM cost).
argument-hint: "[--all] [--session <uuid>] [--since <date>] [--json]"
---

Run the offline analyzer with the user's arguments and display its output verbatim. Do not summarize, paraphrase, or re-format — the CLI's ASCII dashboard is the deliverable.

!vinitokx analyze $ARGUMENTS

If the command fails (non-zero exit), surface the stderr output and suggest:
- Run `bun install && turbo build --filter=@vinitokx/observer` from the repo root if `vinitokx` is not on PATH.
- Run with `--all` if no transcripts are found in the current project.
