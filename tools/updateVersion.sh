#!/usr/bin/env bash
set -euo pipefail

# Bump patch version across:
# - src/stores/game.svelte.ts (game store version)
# - package.json (npm version)
# - android/app/build.gradle (versionCode + versionName)
# - ios/App/App.xcodeproj/project.pbxproj (MARKETING_VERSION + CURRENT_PROJECT_VERSION)
#
# Usage:
#   ./tools/updateVersion.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve project root reliably even when script is run from /tools.
# Prefer git repo root; fall back to parent directory of /tools.
ROOT_DIR="$(
  if git -C "$SCRIPT_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "$SCRIPT_DIR" rev-parse --show-toplevel
  else
    cd "$SCRIPT_DIR/.." && pwd
  fi
)"

PKG_JSON="$ROOT_DIR/package.json"
STORE_FILE="$ROOT_DIR/src/stores/game.svelte.ts"
ANDROID_GRADLE="$ROOT_DIR/android/app/build.gradle"
IOS_PBXPROJ="$ROOT_DIR/ios/App/App.xcodeproj/project.pbxproj"

for f in "$PKG_JSON" "$STORE_FILE" "$ANDROID_GRADLE" "$IOS_PBXPROJ"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing required file: $f" >&2
    exit 1
  fi
done

current_version="$(node -p "require('${PKG_JSON//"/\\"}').version")"
if [[ ! "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "package.json version is not x.y.z: $current_version" >&2
  exit 1
fi

IFS='.' read -r major minor patch <<<"$current_version"
new_version="${major}.${minor}.$((patch + 1))"

android_version_code="$(
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const s = fs.readFileSync(p, 'utf8');
    const m = s.match(/\\bversionCode\\s+(\\d+)/);
    if (!m) process.exit(2);
    process.stdout.write(m[1]);
  " "$ANDROID_GRADLE"
)"

if [[ ! "$android_version_code" =~ ^[0-9]+$ ]]; then
  echo "Could not parse Android versionCode" >&2
  exit 1
fi
new_android_version_code=$((android_version_code + 1))

printf 'Bumping version: %s -> %s\n' "$current_version" "$new_version"
printf 'Android versionCode: %s -> %s\n' "$android_version_code" "$new_android_version_code"

# 1) package.json
node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const newVersion = process.argv[2];
  const raw = fs.readFileSync(path, "utf8");
  const json = JSON.parse(raw);
  json.version = newVersion;
  fs.writeFileSync(path, JSON.stringify(json, null, "\t") + "\n");
' "$PKG_JSON" "$new_version"

# 2) src/stores/store.svelte.ts
node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const newVersion = process.argv[2];
  let s = fs.readFileSync(path, "utf8");
  const re = /(\bversion\b\s*(?::\s*[^=]+)?\s*=\s*\$state\(\s*["\x27])(\d+\.\d+\.\d+)(["\x27]\s*\))/;
  if (!re.test(s)) {
    console.error("Could not find game store version assignment");
    process.exit(2);
  }
  s = s.replace(re, (m, p1, _old, p3) => p1 + newVersion + p3);
  fs.writeFileSync(path, s);
' "$STORE_FILE" "$new_version"

# 3) android/app/build.gradle
node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const newCode = process.argv[2];
  const newVersion = process.argv[3];
  let s = fs.readFileSync(path, "utf8");

  const reCode = /\bversionCode\s+\d+/;
  const reName = /\bversionName\s+\"\d+\.\d+\.\d+\"/;

  if (!reCode.test(s)) {
    console.error("Could not find Android versionCode");
    process.exit(2);
  }
  if (!reName.test(s)) {
    console.error("Could not find Android versionName");
    process.exit(2);
  }

  s = s.replace(reCode, "versionCode " + newCode);
  s = s.replace(reName, "versionName \"" + newVersion + "\"");

  fs.writeFileSync(path, s);
' "$ANDROID_GRADLE" "$new_android_version_code" "$new_version"

# 4) iOS project.pbxproj
# - MARKETING_VERSION = x.y.z;
# - CURRENT_PROJECT_VERSION = <int>;
node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const newBuild = process.argv[2];
  const newVersion = process.argv[3];
  let s = fs.readFileSync(path, "utf8");

  const reMarketing = /\bMARKETING_VERSION\s*=\s*[^;]+;/g;
  const reBuild = /\bCURRENT_PROJECT_VERSION\s*=\s*[^;]+;/g;

  if (!reMarketing.test(s)) {
    console.error("Could not find MARKETING_VERSION in pbxproj");
    process.exit(2);
  }
  if (!reBuild.test(s)) {
    console.error("Could not find CURRENT_PROJECT_VERSION in pbxproj");
    process.exit(2);
  }

  s = s.replace(reMarketing, "MARKETING_VERSION = " + newVersion + ";");
  s = s.replace(reBuild, "CURRENT_PROJECT_VERSION = " + newBuild + ";");

  fs.writeFileSync(path, s);
' "$IOS_PBXPROJ" "$new_android_version_code" "$new_version"

echo "Done. Updated package.json, game store version, Android build.gradle, and iOS pbxproj."

# Output version for parent scripts to capture
echo "NEW_VERSION=$new_version" > "$ROOT_DIR/.version_bump"
