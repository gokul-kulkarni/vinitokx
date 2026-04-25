---
name: token-analyze
description: Use when the user asks about context window usage, wants to know what is consuming tokens, asks "how full is my context", asks "what is using up my context", mentions hitting the context limit, or wants a breakdown of token usage by section. Also use when the context is growing long and you want to proactively surface usage.
---

# Token Analyze

## Overview
Analyze the current conversation's context window usage, identify the top consumers by section, and provide actionable optimization recommendations.

## When to Use
- User asks "how much context is left?" or "what's eating my context?"
- Compaction warnings or "context window full" messages appear
- Session has been running long and you want to check before a large task
- User explicitly requests a token breakdown or usage report

## Process

1. **Identify context sections.** Sections to analyze:
   - System prompt (Claude Code's base instructions, ~2,000–4,000 tokens if unobservable)
   - Injected skills (each SKILL.md adds 500–2,000 tokens)
   - Injected rules (CLAUDE.md and ~/.claude/rules/**)
   - Conversation history (all prior turns)
   - File attachments (files read via Read tool or passed inline)
   - Tool results (Bash, Grep, and other tool outputs)
   - Pending message (current user request)

2. **Estimate token counts.** Use 1 token ≈ 4 characters for prose, 1 token ≈ 3.5 for code. State estimates as approximate (~). Never claim precision.

3. **Calculate metrics.**
   - Total tokens used, context window size (200,000 for Claude 3/4 series), % used, % remaining.

4. **Identify top 5 consumers.** Sort sections by estimated token count.

5. **Generate recommendations.** For each section consuming >10% of the window, provide at least one specific, actionable suggestion. Reference `token-optimize` for applying them.

6. **Format the report:**

```
## Token Analysis Report

**Context Window:** ~[total] / 200,000 tokens ([%] used, [%] remaining)

### Breakdown by Section
| Section | ~Tokens | % of Total |
|---------|---------|-----------|
| Conversation History | ~12,400 | 38.2% |
...

### Top 5 Consumers
1. Conversation History — ~12,400 tokens (38%)
...

### Recommendations
- **Conversation History**: Use `/compact` or ask me to summarize older turns. Est. savings: ~8,700 tokens (70%).
- **File Attachments**: [file] is [X] tokens — use `offset`/`limit` params on future reads.
```

## Common Mistakes
- **System prompt too low**: Default to ~3,000 tokens if unobservable, not 0.
- **Forgetting injected skills**: Each active SKILL.md adds 500–2,000 tokens.
- **Skipping recommendations**: Always include at least one even if usage is below 50%.
