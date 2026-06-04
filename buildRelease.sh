#!/usr/bin/env bash
set -euo pipefail

# Build release artifacts for available native platforms:
# - bumps version metadata via tools/updateVersion.sh
# - builds web assets and syncs native projects via prepare.sh
# - builds Android bundle (.aab), iOS archive (.xcarchive), optional macOS archive, and Electron DMG

MODE="${1:-prod}"
shift || true

if [[ "$MODE" == "production" ]]; then
  MODE="prod"
fi

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "❌ Error: Invalid mode. Use 'dev' or 'prod'"
  echo ""
  echo "Usage: ./buildRelease.sh [dev|prod] [platform...]"
  echo "Platforms: android ios macos electron all"
  echo "Examples:"
  echo "  ./buildRelease.sh prod"
  echo "  ./buildRelease.sh prod android ios"
  echo "  ./buildRelease.sh prod macos"
  echo "  ./buildRelease.sh prod electron"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=tools/ensureNode.sh
source "$ROOT_DIR/tools/ensureNode.sh"
ensure_node_from_nvmrc "$ROOT_DIR"

SELECTED_ANDROID=false
SELECTED_IOS=false
SELECTED_MACOS=false
SELECTED_ELECTRON=false

if [[ $# -eq 0 ]]; then
  [[ -d "$ROOT_DIR/android" ]] && SELECTED_ANDROID=true
  [[ -d "$ROOT_DIR/ios" ]] && SELECTED_IOS=true
  [[ -d "$ROOT_DIR/macos" ]] && SELECTED_MACOS=true
  [[ -d "$ROOT_DIR/electron" ]] && SELECTED_ELECTRON=true
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
      electron)
        SELECTED_ELECTRON=true
        ;;
      all)
        SELECTED_ANDROID=true
        SELECTED_IOS=true
        SELECTED_MACOS=true
        SELECTED_ELECTRON=true
        ;;
      *)
        echo "❌ Error: Invalid platform '$platform'. Use: android ios macos electron all"
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
if [[ "$SELECTED_ELECTRON" == true && ! -d "$ROOT_DIR/electron" ]]; then
  echo "⚠️  Skipping Electron build (electron platform not present)."
  SELECTED_ELECTRON=false
fi

if [[ "$SELECTED_ANDROID" != true && "$SELECTED_IOS" != true && "$SELECTED_MACOS" != true && "$SELECTED_ELECTRON" != true ]]; then
  echo "❌ No valid target platforms selected."
  echo "Run: npx cap add android|ios|macos first, or ensure electron/ exists, then retry."
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "🔨 Building release (${MODE})"
echo "Targets: android=${SELECTED_ANDROID} ios=${SELECTED_IOS} macos=${SELECTED_MACOS} electron=${SELECTED_ELECTRON}"
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

if [[ "$SELECTED_ELECTRON" == true ]]; then
  echo "Building Electron desktop package..."
  cd electron
  npm run electron:make
  cd "$ROOT_DIR"
  echo "✅ Electron build complete: electron/dist/"
  open "$ROOT_DIR/electron/dist" || true
  echo ""
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Release build complete!"
echo "📦 Version: $NEW_VERSION"
echo "═══════════════════════════════════════════════════════════"
echo ""
