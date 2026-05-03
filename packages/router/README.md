# vtkxoptm

Routes four narrow LLM tasks (summarize, docstring, classify, boilerplate) to a
local [Ollama](https://ollama.com) model so the cloud LLM never reads heavy input.
Part of the [vinitokx](../../) token-optimization stack.

## Prerequisites

| Tool | Why | Install |
|------|-----|---------|
| [Ollama](https://ollama.com/download) | runs local models | `brew install ollama` |
| Rust (stable ≥ 1.87) | compile the binary | `curl https://sh.rustup.rs -sSf \| sh` |
| [llmfit](https://github.com/AlexsJones/llmfit) | hardware-aware model scoring (optional) | `brew install llmfit` |

> **macOS only in v1.** Linux support is planned.

## Install

### One-liner (no clone required)

```sh
curl -fsSL https://raw.githubusercontent.com/gokul-kulkarni/vinitokx/main/packages/router/install.sh | bash
```

Downloads a pre-built binary for your platform (macOS arm64/x86, Linux x86_64) from the
latest GitHub Release. Falls back to `cargo build --release` automatically if no pre-built
binary is available.

Then add `~/.local/bin` to your PATH if it isn't already:

```sh
# ~/.zshrc or ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
```

Override the install location:

```sh
VTKXOPTM_INSTALL_DIR=/usr/local/bin \
  curl -fsSL https://raw.githubusercontent.com/gokul-kulkarni/vinitokx/main/packages/router/install.sh | bash
```

### From a local clone

```sh
bash packages/router/install.sh
```

### Via cargo (Rust toolchain required)

```sh
# from the repo root
cargo install --path packages/router

# or without cloning
cargo install --git https://github.com/gokul-kulkarni/vinitokx --manifest-path packages/router/Cargo.toml
```

## First-time setup

```sh
vtkxoptm setup     # detect available memory, pick an Ollama model, pull it
vtkxoptm warm      # verify Ollama is running and the model is loaded
vtkxoptm doctor    # full health check
```

`setup` is interactive. It detects your available RAM (via `llmfit` if installed),
presents a curated list of Ollama-pullable coding models, and runs `ollama pull`
on your choice. The selection is saved to `~/.config/vinitokx/router.toml`.

## Usage

```sh
# Summarize a file
vtkxoptm run --task summarize --file src/parser.ts

# Write a docstring for a function
vtkxoptm run --task docstring --file src/utils.rs

# Classify a user request
vtkxoptm run --task classify --input "add dark mode support"

# Generate boilerplate from a spec
vtkxoptm run --task boilerplate --input "CRUD handlers for a User model"

# Pipe long input via stdin
cat big_spec.txt | vtkxoptm run --task boilerplate --input -

# View token savings dashboard
vtkxoptm gain
```

## Claude Code integration

When this repo's Claude plugin is installed, the `local-llm-runner` subagent
auto-routes any of the four tasks above — no slash command needed.

The SessionStart hook warms the model in the background so first-token latency is
hidden from your first request each session.

## Config

`~/.config/vinitokx/router.toml` (created by `vtkxoptm setup`):

```toml
model = "qwen2.5-coder:7b"
ollama_url = "http://localhost:11434"
log_level = "info"
version = 1
```

## Savings ledger

Every run appends one JSON line to `~/.config/vinitokx/router-savings.jsonl`:

```json
{"ts":1234567890,"task":"summarize","model":"qwen2.5-coder:7b","input_chars":4200,"output_chars":380,"est_tokens_saved":1050,"ms":1240}
```

`vtkxoptm gain` aggregates this into a savings table.

## Build from source (without the install script)

```sh
cd packages/router
cargo build --release
# binary at target/release/vtkxoptm
```

## Minimum toolchain

`rustc >= 1.87` (required by transitive dependencies that use `edition = "2024"`).
Run `rustup update stable` to upgrade.
