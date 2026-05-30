#!/usr/bin/env bash
# Prepare web/native assets for Capacitor platforms:
# - builds web assets
# - syncs Capacitor native projects (android/ios/macos if present)

set -euo pipefail

# Ensure we run from repo root even if invoked elsewhere
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=tools/ensureNode.sh
source "$ROOT_DIR/tools/ensureNode.sh"
ensure_node_from_nvmrc "$ROOT_DIR"

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
