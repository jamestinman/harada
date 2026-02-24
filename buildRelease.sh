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

declare -A SELECTED=(
  [android]=false
  [ios]=false
  [macos]=false
)

if [[ $# -eq 0 ]]; then
  for platform in android ios macos; do
    if [[ -d "$ROOT_DIR/$platform" ]]; then
      SELECTED["$platform"]=true
    fi
  done
else
  for platform in "$@"; do
    case "$platform" in
      android|ios|macos)
        SELECTED["$platform"]=true
        ;;
      all)
        for p in android ios macos; do
          SELECTED["$p"]=true
        done
        ;;
      *)
        echo "❌ Error: Invalid platform '$platform'. Use: android ios macos all"
        exit 1
        ;;
    esac
  done
fi

if [[ "${SELECTED[android]}" == true && ! -d "$ROOT_DIR/android" ]]; then
  echo "⚠️  Skipping Android build (android platform not present)."
  SELECTED[android]=false
fi
if [[ "${SELECTED[ios]}" == true && ! -d "$ROOT_DIR/ios" ]]; then
  echo "⚠️  Skipping iOS build (ios platform not present)."
  SELECTED[ios]=false
fi
if [[ "${SELECTED[macos]}" == true && ! -d "$ROOT_DIR/macos" ]]; then
  echo "⚠️  Skipping macOS build (macos platform not present)."
  SELECTED[macos]=false
fi

if [[ "${SELECTED[android]}" != true && "${SELECTED[ios]}" != true && "${SELECTED[macos]}" != true ]]; then
  echo "❌ No valid target platforms selected."
  echo "Run: npx cap add android|ios|macos first, then retry."
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "🔨 Building release (${MODE})"
echo "Targets: android=${SELECTED[android]} ios=${SELECTED[ios]} macos=${SELECTED[macos]}"
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

if [[ "${SELECTED[android]}" == true ]]; then
  echo "Building Android release bundle..."
  cd android
  ./gradlew bundleRelease
  cd "$ROOT_DIR"
  echo "✅ Android build complete: android/app/build/outputs/bundle/release/app-release.aab"
  open android/app/build/outputs/bundle/release || true
  echo ""
fi

if [[ "${SELECTED[ios]}" == true ]]; then
  echo "Building iOS archive..."
  cd ios/App
  set +e
  xcodebuild archive \
    -workspace App.xcworkspace \
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

if [[ "${SELECTED[macos]}" == true ]]; then
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
