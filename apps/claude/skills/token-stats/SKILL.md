---
name: token-stats
description: Use when the user wants a quick single-screen token summary, asks "how much context do I have left?", "show me token stats", "quick context check", or "am I close to the limit?". Use this instead of token-analyze when the user wants a fast answer without a full breakdown.
---

# Token Stats

## Overview
Display a compact, single-screen token usage dashboard. Fast-path version of `token-analyze` — answer in one block, no follow-up questions.

## Process

1. **Quickly estimate total tokens** by section (rough estimates OK — this is a dashboard). 1 token ≈ 4 chars.
2. **Calculate:** total used, remaining, % used.
3. **Determine trend:**
   - `growing` — many tool calls and file reads in recent turns
   - `stable` — primarily text exchange, low tool use
   - `shrinking` — compaction or summarization recently applied
4. **Render the dashboard:**

```
┌─ Token Stats ──────────────────────────────────────┐
│ Used:      ~32,400 / 200,000  (16.2%)               │
│ Remaining: ~167,600           (83.8%)               │
│ Trend:     growing ↑                                │
├─ Top Consumers ────────────────────────────────────┤
│ Conversation History  ████████░░░░░░░░  ~12,400    │
│ File Attachments      █████░░░░░░░░░░░   ~8,100    │
│ Tool Results          ████░░░░░░░░░░░░   ~5,600    │
│ Injected Rules        ██░░░░░░░░░░░░░░   ~3,200    │
│ Injected Skills       █░░░░░░░░░░░░░░░   ~1,800    │
├─ Recommendation ───────────────────────────────────┤
│ Context growing fast. Consider /compact or          │
│ token-optimize on conversation history.             │
└────────────────────────────────────────────────────┘
```

5. **One-line recommendation** based on overall usage:
   - >85% used → "Context critical — run token-optimize immediately"
   - >70% used → "Context high — consider /compact or token-optimize"
   - 50–70% used → "Context moderate — monitor file attachment growth"
   - <50% used → "Context healthy — no action needed"

## ASCII Bar Chart
Each block (█) = 6.25% of total used tokens.
Formula: `Math.round((sectionTokens / totalTokens) * 16)` filled blocks.

## Common Mistakes
- **Too much detail**: If the user wants a full breakdown, redirect to `token-analyze`.
- **Incorrect bars**: Bars are relative to total used tokens, not context window size.
- **Unknown trend**: Default to `stable` if there is no signal — don't guess.
