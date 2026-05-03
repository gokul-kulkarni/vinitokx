# ViniTokx

Token analysis and optimization plugin for Claude Code and other AI coding assistants.

*ViniTokx* derives from the Sanskrit root "Viniyoga" — purposeful utilization.

## Packages

| Package | Description |
|---------|-------------|
| `@vinitokx/claude` | Claude Code plugin with `token-analyze`, `token-optimize`, `token-stats` skills |
| `@vinitokx/core` | Token analysis engine — counting, breakdown, optimization suggestions |
| `@vinitokx/cursor` | Cursor IDE plugin (placeholder) |
| `@vinitokx/codex` | OpenAI Codex plugin (placeholder) |

## Install the Claude Code Plugin

```sh
claude plugin add @vinitokx/claude
```

## Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `token-analyze` | "What's eating my context?" | Full breakdown by section + recommendations |
| `token-optimize` | "Free up context" / compress content | Apply compression techniques with confirmation |
| `token-stats` | "Quick context check" | Single-screen ASCII dashboard |

## Development

```sh
bun install
turbo build         # Compile packages/core to dist/
turbo check-types   # Type-check all workspaces
turbo lint          # Lint all workspaces
```

## License

MIT
