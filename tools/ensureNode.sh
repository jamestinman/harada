#!/usr/bin/env bash
# Ensure the Node.js major version from .nvmrc is active.
# Sources nvm when available, then prepends the matching nvm install to PATH.

ensure_node_from_nvmrc() {
  local root_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

  if [[ ! -f "$root_dir/.nvmrc" ]]; then
    return 0
  fi

  local required_version
  required_version="$(tr -d '[:space:]' < "$root_dir/.nvmrc")"
  if [[ -z "$required_version" ]]; then
    echo "❌ Error: .nvmrc is empty."
    exit 1
  fi

  if [[ -n "${npm_config_prefix:-}" ]]; then
    unset npm_config_prefix
  fi

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  local nvm_sh=""
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    nvm_sh="$nvm_dir/nvm.sh"
  elif [[ -s "/opt/homebrew/opt/nvm/nvm.sh" ]]; then
    nvm_sh="/opt/homebrew/opt/nvm/nvm.sh"
  elif [[ -s "/usr/local/opt/nvm/nvm.sh" ]]; then
    nvm_sh="/usr/local/opt/nvm/nvm.sh"
  fi

  if [[ -n "$nvm_sh" ]]; then
    # shellcheck source=/dev/null
    . "$nvm_sh"
    if command -v nvm >/dev/null 2>&1; then
      nvm use "$required_version" >/dev/null 2>&1 || true
    fi
  fi

  local nvm_bin=""
  for candidate in "$HOME/.nvm/versions/node/v${required_version}."*/bin; do
    if [[ -x "$candidate/node" ]]; then
      nvm_bin="$candidate"
    fi
  done

  if [[ -n "$nvm_bin" ]]; then
    export PATH="$nvm_bin:$PATH"
  fi

  local current_major=""
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  fi

  if [[ "$current_major" != "$required_version" ]]; then
    echo "❌ Error: Node version mismatch."
    if command -v node >/dev/null 2>&1; then
      echo "Current:  $(node -v) ($(command -v node))"
    else
      echo "Current:  node not found"
    fi
    if command -v npm >/dev/null 2>&1; then
      echo "npm:      $(command -v npm)"
    fi
    echo "Expected major version from .nvmrc: $required_version"
    echo "Install with: nvm install $required_version"
    echo "Then run:     nvm use $required_version"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "❌ Error: npm not found after selecting Node $(node -v)."
    exit 1
  fi

  local npm_node_major
  npm_node_major="$(npm exec -- node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
  if [[ -n "$npm_node_major" && "$npm_node_major" != "$required_version" ]]; then
    echo "❌ Error: npm is using Node v${npm_node_major}.x, expected v${required_version}.x."
    echo "node: $(command -v node)"
    echo "npm:  $(command -v npm)"
    exit 1
  fi

  echo "Using Node $(node -v) (from .nvmrc)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  ensure_node_from_nvmrc
fi
