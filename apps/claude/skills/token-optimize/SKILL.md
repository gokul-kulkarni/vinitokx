---
name: token-optimize
description: Use when the user wants to reduce context window usage, asks to compress or summarize content, asks "how do I free up context?", or when token-analyze has identified specific sections for optimization. Also use when you need to compress your own prior tool outputs or responses before continuing a long session.
---

# Token Optimize

## Overview
Apply targeted compression to reduce token usage in specific content — files, conversation history, tool outputs, or prompts — while preserving semantic meaning.

## Compression Techniques

| Technique | When to Use | Est. Savings |
|-----------|-------------|-------------|
| Remove redundancy | Repeated explanations, duplicate imports | 10–30% |
| Summarize | Conversation history, verbose docs | 50–80% |
| Use reference | Inline code that could be "see line X" | 20–50% |
| Compress patterns | Repeated structures, long lists | 20–40% |
| Truncate | File contents where partial read suffices | 30–70% |
| Deduplicate | Duplicate tool outputs, repeated reads | 20–60% |

## Process

1. **Confirm target content.** If called from `token-analyze`, the target section is already identified.

2. **Estimate current token count** (1 token ≈ 4 chars).

3. **Select techniques** by content type:
   - Conversation history → `summarize` (preserve decisions, discard exploration)
   - File contents → `truncate` + `use reference`
   - Tool results → `remove-redundancy` + `summarize`
   - Prompts/rules → `remove-redundancy` + `compress-patterns`

4. **Produce compressed version.** Show a diff summary (key additions/removals), not the full diff unless asked.

5. **Estimate savings.** Show: `[original] → [compressed] tokens ([X]% reduction)`.

6. **Request confirmation** before applying to any live context. Never modify CLAUDE.md or SKILL.md files without explicit user approval.

## Common Mistakes
- **Over-compressing**: Content needed shortly will have to be re-read, costing tokens. Ask about future needs before aggressive truncation.
- **Applying without confirmation**: Always show the plan first.
- **Not tracking removals**: Note what was omitted so the user can recover it if needed.
