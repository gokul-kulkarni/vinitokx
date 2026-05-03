#!/usr/bin/env bash
# install.sh — install vtkxoptm from a pre-built binary or build from source.
#
# Quick install (no git clone required):
#   curl -fsSL https://raw.githubusercontent.com/gokul-kulkarni/vinitokx/main/packages/router/install.sh | bash
#
# From a local clone:
#   bash packages/router/install.sh
set -euo pipefail

BINARY="vtkxoptm"
REPO="gokul-kulkarni/vinitokx"
INSTALL_DIR="${VTKXOPTM_INSTALL_DIR:-$HOME/.local/bin}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n'  "$*"; }
note()  { printf '  %s\n' "$*"; }

# ── Detect platform ───────────────────────────────────────────────────────────

detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64)  echo "aarch64-apple-darwin" ;;
        x86_64) echo "x86_64-apple-darwin" ;;
        *)      echo ""; return 1 ;;
      esac ;;
    Linux)
      case "$arch" in
        x86_64) echo "x86_64-unknown-linux-gnu" ;;
        *)      echo ""; return 1 ;;
      esac ;;
    *)
      echo ""; return 1 ;;
  esac
}

# ── Strategy A: download pre-built binary from latest GitHub Release ──────────

install_prebuilt() {
  local target="$1"

  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi

  bold "Fetching latest release info from GitHub…"
  local api_url="https://api.github.com/repos/${REPO}/releases/latest"
  local release_json
  if ! release_json="$(curl -fsSL "$api_url" 2>/dev/null)"; then
    note "Could not reach GitHub API — falling back to build from source."
    return 1
  fi

  # Extract the download URL for our target binary
  local asset_name="${BINARY}-${target}"
  local download_url
  download_url="$(printf '%s' "$release_json" \
    | grep -o '"browser_download_url": *"[^"]*'"$asset_name"'"' \
    | grep -o 'https://[^"]*' || true)"

  if [[ -z "$download_url" ]]; then
    note "No pre-built binary found for $target — falling back to build from source."
    return 1
  fi

  local tag
  tag="$(printf '%s' "$release_json" | grep -o '"tag_name": *"[^"]*"' | grep -o 'vtkxoptm[^"]*' || true)"
  bold "Downloading ${BINARY} ${tag} for ${target}…"

  local tmp
  tmp="$(mktemp)"
  if ! curl -fsSL --progress-bar "$download_url" -o "$tmp"; then
    rm -f "$tmp"
    note "Download failed — falling back to build from source."
    return 1
  fi

  mkdir -p "$INSTALL_DIR"
  mv "$tmp" "$INSTALL_DIR/$BINARY"
  chmod +x "$INSTALL_DIR/$BINARY"
  return 0
}

# ── Strategy B: build from source ─────────────────────────────────────────────

install_from_source() {
  # Prefer the rustup-managed cargo (≥1.87) over any system cargo so that
  # edition2024 transitive dependencies compile correctly. The rustup binary
  # may be shadowed in PATH by a Homebrew or system cargo at a lower index.
  if [[ -x "$HOME/.cargo/bin/cargo" ]]; then
    export PATH="$HOME/.cargo/bin:$PATH"
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    red "ERROR: 'cargo' not found."
    note "Install Rust: curl https://sh.rustup.rs -sSf | sh  (then: rustup default stable)"
    exit 1
  fi

  # Locate the crate directory — works whether run via curl|bash or from the repo
  local crate_dir
  if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "bash" ]]; then
    crate_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  else
    # Piped via curl — clone into a temp dir
    if ! command -v git >/dev/null 2>&1; then
      red "ERROR: 'git' not found. Install git or run from inside the cloned repo."
      exit 1
    fi
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    bold "Cloning repository for source build…"
    git clone --depth 1 "https://github.com/${REPO}.git" "$tmp_dir"
    crate_dir="$tmp_dir/packages/router"
  fi

  if [[ ! -f "$crate_dir/Cargo.toml" ]]; then
    red "ERROR: Cargo.toml not found in $crate_dir"
    exit 1
  fi

  bold "Building $BINARY from source (release)…"
  (cd "$crate_dir" && cargo build --release)

  local src="$crate_dir/target/release/$BINARY"
  if [[ ! -x "$src" ]]; then
    red "ERROR: build succeeded but binary not found at $src"
    exit 1
  fi

  mkdir -p "$INSTALL_DIR"
  cp "$src" "$INSTALL_DIR/$BINARY"
  chmod +x "$INSTALL_DIR/$BINARY"
}

# ── Prereq: Ollama ────────────────────────────────────────────────────────────

if ! command -v ollama >/dev/null 2>&1; then
  red "ERROR: 'ollama' not found."
  note "Install: https://ollama.com/download"
  exit 1
fi

if ! command -v llmfit >/dev/null 2>&1; then
  echo "NOTE: 'llmfit' not found — setup will skip hardware-aware model scoring."
  echo "      Install (optional): brew install llmfit"
fi

# ── Install ───────────────────────────────────────────────────────────────────

target="$(detect_target 2>/dev/null || true)"

if [[ -n "$target" ]] && install_prebuilt "$target"; then
  green "Installed $BINARY (pre-built) → $INSTALL_DIR/$BINARY"
else
  install_from_source
  green "Installed $BINARY (built from source) → $INSTALL_DIR/$BINARY"
fi

# ── PATH check ────────────────────────────────────────────────────────────────

if ! echo ":$PATH:" | grep -q ":$INSTALL_DIR:"; then
  echo ""
  echo "  '$INSTALL_DIR' is not in your PATH. Add this to your shell rc:"
  echo ""
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "  Then reload: source ~/.zshrc  (or ~/.bashrc)"
fi

# ── Next steps ────────────────────────────────────────────────────────────────

echo ""
bold "Next steps:"
echo "  1. vtkxoptm setup    — pick a local model and pull it once"
echo "  2. vtkxoptm warm     — verify Ollama is running"
echo "  3. vtkxoptm doctor   — full health check"
