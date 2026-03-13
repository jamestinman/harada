# Haradato
Harada chart with to-do list backend - a goal-setting and productivity app with cloud sync

## Grid Structure
Overall, the grid uses chess-like coordinates: `[letter][number]` (e.g. `E5`).

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

# Build all available release targets (android/ios/macos if present)
./buildRelease.sh prod

# Build selected targets only
./buildRelease.sh prod android ios
./buildRelease.sh prod macos
```

Expected outputs:

- Android bundle: `android/app/build/outputs/bundle/release/app-release.aab`
- iOS archive: `ios/App/build/App.xcarchive`
- macOS archive (if `macos` platform exists): `macos/App/build/App-macos.xcarchive`

Notes:

- Version metadata is bumped by `tools/updateVersion.sh` before release builds.
- To enable desktop macOS release, first add the platform: `npx cap add macos`


## TODO / Roadmap
- Desktop Electron version(s)
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
