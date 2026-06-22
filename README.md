# Haradato
Harada chart with to-do list backend - a goal-setting and productivity app with cloud sync

## Test (prep scripts build + `npx cap sync` for each platform)
npm run ios
npm run android
npm run electron

Desktop dev syncs web assets into `electron/app/` via `npm run electron:sync` (or `./prepare.sh`).

### Desktop build (DMG)
```sh
npm run electron:make
# or: ./buildRelease.sh prod electron
open ~/git/harada/electron/dist/
```
Then run e.g. `Haradato-1.0.0-arm64.dmg`.

## Grid Structure
Overall, the grid uses chess-like coordinates: `[letter][number]` e.g. from top left it goes A1, A2, A3, ...

# Pseudo goals Z1, Z1
`Z1` is the "Pinned Goals" goal
`Z2` is the "Null goal" that tasks get if they have no goal (in order to _still_ have ordering in that context)

Columns:
[A][B][C][D][E][F][G][H][I]

Rows:
[1]
[2]
[3]
[4]
[5]
[6]
[7]
[8]
[9]

The central goal is at E5. Each of the goals that surrounds it (D4,E4,F4,D5,F5,D6,E6,F6) has it's own set of 8 sub-goals surrounding it twin square.
Twinned squares:
  D4=>B2 E4=>E2 F4=>H2
  D5=>B5        F5=>H5
  D6=>B8 E6=>E8 F6=>H8

To-do list entries hang off grid coordinates, e.g.:
## E5 My goal is play the piano
### B3 My sub-goal is to learn scales
[x] Find a piano teacher
  [ ] Have first lesson

## Features

- ✅ **9x9 Harada Chart** - Visual goal planning with linked cells
- ✅ **To-Do Lists** - Tasks associated with each goal
- ✅ **Cloud Sync** - Supabase authentication and real-time sync
- ✅ **Local-First** - Works offline, syncs when online
- ✅ **Markdown Export/Import** - Backup and share your charts
- ✅ **Real-Time Updates** - Changes sync across all your devices
- ✅ **Mobile Support** - Built with Capacitor for iOS and Android

## Quick Start

### Prerequisites
- Node.js 18+
- A Supabase account (free tier works great)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Supabase (see [SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md))

4. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

5. Add your Supabase credentials to `.env`:
   ```
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

6. Start the dev server:
   ```bash
   npm run dev
   ```

## Documentation

- **[Supabase Setup Guide](./docs/SUPABASE_SETUP.md)** - Complete guide to setting up authentication and database
- **[Example Markdown](./docs/example.md)** - See the markdown save format

## Tech Stack

- **Frontend**: Svelte 5 + SvelteKit
- **Styling**: TailwindCSS 4
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Mobile**: Capacitor 8
- **Deployment**: Vercel/Netlify ready

## How It Works

### Local-First Architecture

Haradato uses a local-first approach for the best user experience:

1. **Immediate saves**: All changes save to localStorage instantly
2. **Background sync**: When logged in, changes sync to Supabase (debounced)
3. **Offline support**: Full functionality without internet
4. **Real-time**: Changes sync across devices in real-time


## Mobile Development

```bash
# Build and sync to Capacitor
npm run build
npx cap sync

# Open in Xcode (iOS)
npx cap open ios

# Open in Android Studio
npx cap open android
```

## Release Builds

Use the helper scripts to bump versions, build web assets, sync Capacitor, and create native release artifacts.

```bash
# Prep only (build web + cap sync for available platforms)
./prepare.sh prod

# Build all available release targets (android/ios/macos/electron if present)
./buildRelease.sh prod

# Build selected targets only
./buildRelease.sh prod android ios
./buildRelease.sh prod macos
./buildRelease.sh prod electron
```

Expected outputs:

- Android bundle: `android/app/build/outputs/bundle/release/app-release.aab`
- iOS archive: `ios/App/build/App.xcarchive`
- macOS archive (if `macos` platform exists): `macos/App/build/App-macos.xcarchive`
- Electron DMG (if `electron/` exists): `electron/dist/Haradato-<version>-<arch>.dmg`

Notes:

- Version metadata is bumped by `tools/updateVersion.sh` before release builds.
- To enable desktop macOS release, first add the platform: `npx cap add macos`
- Google Play requires signed Android bundles. Before `./buildRelease.sh prod android`, create `android/keystore.properties`:
  ```properties
  storeFile=../release.jks
  storePassword=your_store_password
  keyAlias=your_key_alias
  keyPassword=your_key_password
  ```
  You can generate a key if needed:
  ```bash
  keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
  ```
  Keep the `.jks` file and passwords safe. Losing them prevents updating the app on Play.


## TODO / Roadmap
- Monetisation
  - Ads?
  - Pro - remove ads for £2.99
  - Premium - $.99/mth (3 months free if upgrading from Pro)

## Premium Accounts (competes with Monday.com etc but ENFORCES focus!)
- Go Ad Free
- Export / import as .md file
- Sharing and collaboration features
  - Multiple Harada charts per user
  - Shared goal or whole chart (e.g. for a company)
- Multimedia: upload images and videos to notes
