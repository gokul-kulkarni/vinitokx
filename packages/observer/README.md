# @vinitokx/observer

Zero-token offline analyzer for Claude Code transcripts. Reads JSONL files Claude Code already writes to `~/.claude/projects/` and reports per-tool, per-model, and tool×model token consumption — without invoking any LLM.

## Install

Build and link globally so `vinitokx` is on PATH:

```sh
turbo build --filter=@vinitokx/observer
cd packages/observer && bun link && cd ../..
```

You can now run `vinitokx` from anywhere. To unlink later: `bun unlink @vinitokx/observer`.

To run without linking:

```sh
node packages/observer/dist/cli.js analyze
```

## Usage

```sh
vinitokx analyze                           # Current project (cwd → hashed dir)
vinitokx analyze --all                     # Every project on this machine
vinitokx analyze --session <uuid>          # One session
vinitokx analyze --since 2026-04-01        # Time range
vinitokx analyze --until 2026-05-01
vinitokx analyze --project <path>          # Explicit project root
vinitokx analyze --json                    # Machine-readable
vinitokx analyze --compact                 # Single-screen dashboard
vinitokx --help
```

## Output

```
ViniTokx Token Report — 3 sessions, 47 turns, 2026-04-25 → 2026-05-03

By Model
────────────────────────────────────────────────────────────
claude-sonnet-4-6     input:    3,402   output:    8,221   cache_r:  124,890   est. $0.42
claude-opus-4-7        input:    1,102   output:    2,876   cache_r:   18,221   est. $0.31

By Tool (turn-level approximation — see footer)
────────────────────────────────────────────────────────────
Bash      28 calls in 21 turns   ~6,400 output tokens   avg 305/call
Read      19 calls in 14 turns   ~3,200 output tokens   avg 229/call

Tool × Model
────────────────────────────────────────────────────────────
Bash      claude-sonnet-4-6     24 calls
Bash      claude-opus-4-7        4 calls

— Per-tool figures are turn-level approximations. 0 unpriced models. 0 malformed lines skipped.
```

## How it works

Claude Code writes a JSONL transcript per session to `~/.claude/projects/<hashed-cwd>/<session-uuid>.jsonl`. Each `assistant` line records the model used and exact token usage (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) plus the tool calls emitted. We stream-read those files and aggregate.

**Per-model figures are exact.** Per-tool figures are approximate: an assistant turn has one usage block but may emit multiple `tool_use` blocks, so we distribute the turn's tokens equally among them and also display call count vs distinct turn count so you can judge the approximation.

## Pricing override

Default prices (USD per 1M tokens) are hardcoded for known Claude 4 models. Override by writing `~/.vinitokx/pricing.json`:

```json
{
  "claude-sonnet-4-6": {
    "input": 3.0,
    "output": 15.0,
    "cacheRead": 0.3,
    "cacheWrite": 3.75
  }
}
```

Unknown models render as `est. $—` and are listed in the report footer.

## Optional real-time hook

Want events written live (in addition to the JSONL transcripts Claude Code already writes)? Add to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "vinitokx hook" }]
      }
    ]
  }
}
```

Each tool call appends one line to `~/.vinitokx/events.jsonl`. The hook never blocks Claude Code — parse failures and write errors are silently swallowed. Cost: one Node process spawn per tool call (~10–20ms).

For most workflows the offline `vinitokx analyze` is sufficient — the transcripts already contain everything needed.
