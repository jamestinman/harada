#!/usr/bin/env bash
set -euo pipefail

# Build release artifacts for available native platforms:
# - bumps version metadata via tools/updateVersion.sh
# - builds web assets and syncs native projects via prepare.sh
# - builds Android bundle (.aab), iOS archive (.xcarchive), and optional macOS archive

MODE="${1:-prod}"
shift || true

if [[ "$MODE" == "production" ]]; then
  MODE="prod"
fi

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "❌ Error: Invalid mode. Use 'dev' or 'prod'"
  echo ""
  echo "Usage: ./buildRelease.sh [dev|prod] [platform...]"
  echo "Platforms: android ios macos all"
  echo "Examples:"
  echo "  ./buildRelease.sh prod"
  echo "  ./buildRelease.sh prod android ios"
  echo "  ./buildRelease.sh prod macos"
  exit 1
fi

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

SELECTED_ANDROID=false
SELECTED_IOS=false
SELECTED_MACOS=false

if [[ $# -eq 0 ]]; then
  [[ -d "$ROOT_DIR/android" ]] && SELECTED_ANDROID=true
  [[ -d "$ROOT_DIR/ios" ]] && SELECTED_IOS=true
  [[ -d "$ROOT_DIR/macos" ]] && SELECTED_MACOS=true
else
  for platform in "$@"; do
    case "$platform" in
      android)
        SELECTED_ANDROID=true
        ;;
      ios)
        SELECTED_IOS=true
        ;;
      macos)
        SELECTED_MACOS=true
        ;;
      all)
        SELECTED_ANDROID=true
        SELECTED_IOS=true
        SELECTED_MACOS=true
        ;;
      *)
        echo "❌ Error: Invalid platform '$platform'. Use: android ios macos all"
        exit 1
        ;;
    esac
  done
fi

if [[ "$SELECTED_ANDROID" == true && ! -d "$ROOT_DIR/android" ]]; then
  echo "⚠️  Skipping Android build (android platform not present)."
  SELECTED_ANDROID=false
fi
if [[ "$SELECTED_IOS" == true && ! -d "$ROOT_DIR/ios" ]]; then
  echo "⚠️  Skipping iOS build (ios platform not present)."
  SELECTED_IOS=false
fi
if [[ "$SELECTED_MACOS" == true && ! -d "$ROOT_DIR/macos" ]]; then
  echo "⚠️  Skipping macOS build (macos platform not present)."
  SELECTED_MACOS=false
fi

if [[ "$SELECTED_ANDROID" != true && "$SELECTED_IOS" != true && "$SELECTED_MACOS" != true ]]; then
  echo "❌ No valid target platforms selected."
  echo "Run: npx cap add android|ios|macos first, then retry."
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "🔨 Building release (${MODE})"
echo "Targets: android=${SELECTED_ANDROID} ios=${SELECTED_IOS} macos=${SELECTED_MACOS}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Bump version and build numbers
./tools/updateVersion.sh

# Capture the new version number
if [ -f ".version_bump" ]; then
  # shellcheck source=/dev/null
  source .version_bump
  rm -f .version_bump
else
  # Fallback: read from package.json if .version_bump doesn't exist
  NEW_VERSION="$(node -p "require('./package.json').version")"
fi

# Prepare build - builds web assets and syncs capacitor platforms
./prepare.sh "$MODE"

if [[ "$SELECTED_ANDROID" == true ]]; then
  echo "Building Android release bundle..."
  cd android
  ./gradlew bundleRelease
  cd "$ROOT_DIR"
  echo "✅ Android build complete: android/app/build/outputs/bundle/release/app-release.aab"
  open android/app/build/outputs/bundle/release || true
  echo ""
fi

if [[ "$SELECTED_IOS" == true ]]; then
  echo "Building iOS archive..."
  cd ios/App
  set +e
  if [[ -d "App.xcworkspace" ]]; then
    IOS_BUILD_ARG=(-workspace App.xcworkspace)
  else
    IOS_BUILD_ARG=(-project App.xcodeproj)
  fi
  xcodebuild archive \
    "${IOS_BUILD_ARG[@]}" \
    -scheme App \
    -configuration Release \
    -archivePath build/App.xcarchive \
    -allowProvisioningUpdates > /tmp/ios_archive.log 2>&1
  IOS_ARCHIVE_EXIT_CODE=$?
  set -e
  if [[ $IOS_ARCHIVE_EXIT_CODE -eq 0 && -d "build/App.xcarchive" ]]; then
    echo "✅ iOS archive created: ios/App/build/App.xcarchive"
    open build/App.xcarchive || true
  else
    echo "⚠️  iOS archive failed (exit code: $IOS_ARCHIVE_EXIT_CODE)"
    echo "    Check /tmp/ios_archive.log"
  fi
  cd "$ROOT_DIR"
  echo ""
fi

if [[ "$SELECTED_MACOS" == true ]]; then
  echo "Building macOS archive..."
  cd macos/App
  set +e
  xcodebuild archive \
    -workspace App.xcworkspace \
    -scheme App \
    -configuration Release \
    -destination "generic/platform=macOS" \
    -archivePath build/App-macos.xcarchive \
    -allowProvisioningUpdates > /tmp/macos_archive.log 2>&1
  MACOS_ARCHIVE_EXIT_CODE=$?
  set -e
  if [[ $MACOS_ARCHIVE_EXIT_CODE -eq 0 && -d "build/App-macos.xcarchive" ]]; then
    echo "✅ macOS archive created: macos/App/build/App-macos.xcarchive"
    open build/App-macos.xcarchive || true
  else
    echo "⚠️  macOS archive failed (exit code: $MACOS_ARCHIVE_EXIT_CODE)"
    echo "    Check /tmp/macos_archive.log"
  fi
  cd "$ROOT_DIR"
  echo ""
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Release build complete!"
echo "📦 Version: $NEW_VERSION"
echo "═══════════════════════════════════════════════════════════"
echo ""
