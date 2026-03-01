#!/usr/bin/env bash
# Prepare web/native assets for Capacitor platforms:
# - builds web assets
# - syncs Capacitor native projects (android/ios/macos if present)

set -euo pipefail

# Ensure we run from repo root even if invoked elsewhere
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ensure_node_from_nvmrc() {
  if [[ ! -f "$ROOT_DIR/.nvmrc" ]]; then
    return 0
  fi

  local required_version
  required_version="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"
  if [[ -z "$required_version" ]]; then
    echo "❌ Error: .nvmrc is empty."
    exit 1
  fi

  local current_major=""
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  fi

  if [[ "$current_major" != "$required_version" ]]; then
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
      if [[ -n "${npm_config_prefix:-}" ]]; then
        unset npm_config_prefix
      fi
      # shellcheck source=/dev/null
      . "$nvm_sh"
      if command -v nvm >/dev/null 2>&1; then
        nvm use "$required_version" >/dev/null 2>&1 || true
      fi
    fi
  fi

  if command -v node >/dev/null 2>&1; then
    current_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  else
    current_major=""
  fi

  if [[ "$current_major" != "$required_version" ]]; then
    local nvm_bin=""
    for candidate in "$HOME/.nvm/versions/node/v${required_version}."*/bin; do
      if [[ -x "$candidate/node" ]]; then
        nvm_bin="$candidate"
        break
      fi
    done
    if [[ -n "$nvm_bin" ]]; then
      export PATH="$nvm_bin:$PATH"
      current_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    fi
  fi

  if [[ "$current_major" != "$required_version" ]]; then
    echo "❌ Error: Node version mismatch."
    if command -v node >/dev/null 2>&1; then
      echo "Current:  $(node -v)"
    else
      echo "Current:  node not found"
    fi
    echo "Expected major version from .nvmrc: $required_version"
    echo "Run: nvm use $required_version"
    exit 1
  fi

  echo "Using Node $(node -v) (from .nvmrc)"
}

ensure_node_from_nvmrc

MODE="${1:-prod}"
if [[ "$MODE" == "production" ]]; then
  MODE="prod"
fi

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "❌ Error: Invalid mode. Use 'dev' or 'prod'"
  echo ""
  echo "Usage: ./prepare.sh [dev|prod]"
  exit 1
fi

echo "Preparing build (${MODE})"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Build static web assets
echo "Building web assets (vite)..."
BUILD_TARGET=static npm run build

PLATFORMS=()
for platform in android ios macos; do
  if [[ -d "$ROOT_DIR/$platform" ]]; then
    PLATFORMS+=("$platform")
  fi
done

if [[ ${#PLATFORMS[@]} -eq 0 ]]; then
  echo "Syncing Capacitor (no native platform folders detected, syncing all configured platforms)..."
  npx cap sync
else
  echo "Syncing Capacitor platforms: ${PLATFORMS[*]}"
  npx cap sync "${PLATFORMS[@]}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Prep complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
