# Haradato Architecture (High-Level)

This repository is a SvelteKit app with local-first state, optional Supabase cloud sync, and Capacitor/Electron packaging for native runtimes.

```text
                                +-------------------------+
                                |      End User UI        |
                                | (Web / iOS / Android /  |
                                |        Electron)        |
                                +------------+------------+
                                             |
                                             v
                                +-------------------------+
                                | SvelteKit Frontend      |
                                | - routes/(app),         |
                                |   routes/(website)      |
                                | - components/*          |
                                +------------+------------+
                                             |
                                             v
                                +-------------------------+
                                | Client State Layer      |
                                | src/stores/store.svelte |
                                | src/stores/auth.svelte  |
                                +--+-------------------+--+
                                   |                   |
                 local-first save  |                   | auth/session + sync
                                   |                   |
                                   v                   v
                +-----------------------+      +--------------------------+
                | Local Persistence     |      | Supabase Client SDK      |
                | - IndexedDB mirror    |      | src/lib/supabaseClient   |
                |   (LocalHaradaDb)     |      +------------+-------------+
                | - Capacitor prefs +   |                   |
                |   localStorage fallback|                   |
                +-----------+-----------+                   |
                            |                               |
                            +-------------------+-----------+
                                                |
                                                v
                          +----------------------------------------+
                          | Supabase Backend (Postgres + Auth)     |
                          | - Tables: harada_charts, tasks, notes, |
                          |   note_task_links, note_goal_links,     |
                          |   task_goal_links                       |
                          | - RLS + realtime + upsert_*_if_newer   |
                          +--------------------+-------------------+
                                               ^
                                               |
                          +--------------------+-------------------+
                          | SvelteKit Server Endpoints             |
                          | src/routes/api/agent/*                 |
                          | - MLAuth signature verification         |
                          | - agent access approval checks          |
                          | - server-side admin Supabase client     |
                          +--------------------+-------------------+
                                               ^
                                               |
                          +--------------------+-------------------+
                          | External AI Agents / Integrators       |
                          | (signed MLAuth requests to /api/agent) |
                          +----------------------------------------+


Packaged runtime wrappers:

  Web build (SvelteKit adapters)
      |
      +--> Capacitor (iOS/Android) via capacitor.config.ts and native projects
      |
      +--> Electron shell (electron/src/*) with menu, preload, auto-update
```

## Main Code Areas

- `src/routes/(app)`: authenticated/product app screens (`/harada`, `/todo`, `/notes`, etc.).
- `src/routes/(website)`: public marketing/help pages.
- `src/components`: UI building blocks (`TodoList`, `NotesWorkspace`, chart components, modals).
- `src/stores`: app-wide state and orchestration (boot, local save, sync, realtime merge).
- `src/lib`: shared client logic (storage, todo utilities, auth redirects, local DB mirror).
- `src/lib/server` + `src/routes/api/agent`: server-only logic and agent API endpoints.
- `electron/*`, `ios/*`, `android/*`: desktop and mobile wrappers/runtime projects.

## Data & Persistence Model

- **Primary cloud data model**: Supabase Postgres (`tasks`, `notes`, link tables, `harada_charts` grid).
- **Client local-first model**:
  - IndexedDB mirror for chart/tasks/notes/links (`src/lib/LocalHaradaDb.js`).
  - Fallback persistence via Capacitor Preferences and `localStorage` (`src/lib/PersistentStorage.mjs`).
- **Sync strategy**:
  - Save locally first, then sync to cloud when authenticated/online.
  - Conflict handling uses updated timestamps and RPCs like `upsert_tasks_if_newer`.
  - Supabase realtime subscriptions merge remote changes into active client state.

## External Integrations

- **Supabase**: auth, database, realtime subscriptions, row-level security.
- **MLAuth**: request signing and verification for `/api/agent/*` endpoints.
- **Capacitor**: native iOS/Android runtime and device persistence bridge.
- **Electron**: desktop shell, menus, preload bridge, updater.
# Repository Structure

```text
harada/
├── src/
│   ├── components/
│   ├── lib/
│   │   ├── assets/
│   │   └── server/
│   ├── routes/
│   │   ├── (app)/
│   │   ├── (website)/
│   │   ├── api/
│   │   ├── [goal]/
│   │   ├── about/
│   │   ├── app/
│   │   ├── notes/
│   │   ├── privacy/
│   │   └── reset-password/
│   ├── stores/
│   ├── app.html
│   └── hooks.server.js
├── android/
│   ├── app/
│   ├── gradle/
│   ├── capacitor-cordova-android-plugins/
│   ├── build/
│   ├── build.gradle
│   └── settings.gradle
├── ios/
│   ├── App/
│   │   ├── App/
│   │   ├── App.xcodeproj/
│   │   └── CapApp-SPM/
│   ├── capacitor-cordova-ios-plugins/
│   └── DerivedData/
├── electron/
│   ├── src/
│   │   └── rt/
│   ├── app/
│   ├── assets/
│   ├── resources/
│   └── build/
├── docs/
│   └── patches/
├── resources/
│   ├── android/
│   ├── ios/
│   └── windows/
├── promo/
│   ├── android/
│   └── ios/
├── static/
│   ├── .well-known/
│   ├── img/
│   └── onboarding/
├── tools/
├── build/
├── package.json
├── svelte.config.js
├── vite.config.js
├── capacitor.config.ts
├── README.md
└── QUICK_START.md
```
