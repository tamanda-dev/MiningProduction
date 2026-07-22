# Mining Production Tracking — Operator App

React Native (Expo) app for machine operators to log production data during
a shift, built offline-first for intermittent/no connectivity underground.
Talks to the same Django backend as the manager dashboard (see `../backend`).

## What it does

1. **Login** — JWT auth against the backend (`expo-secure-store` on
   Android/iOS, falls back to `localStorage` on web since SecureStore has no
   web implementation).
2. **Select Site** — filtered to sites the operator holds a machine-type
   qualification at (operators normally have no `UserSiteAccess` grants at
   all — that's the Supervisor mechanism).
3. **Select Machine** — filtered by site + machine type the operator is
   qualified for and currently `active`; picking one opens a section
   picker, then claims it via `POST /machines/{id}/activate/`. A 409 (someone
   else just claimed it) surfaces as a friendly message and refreshes the
   list, never a crash.
4. **Production tab** — a form generated entirely from
   `GET /machine-types/{id}/form-schema/?section={id}` (hourly time-slot
   picker or shift-total, dynamic fields per the machine type's configured
   parameters, comments) — nothing about field names is hardcoded.
5. **Breakdown tab** — reason code or free-text fault description,
   severity, optional "already resolved" end time.
6. **Release tab** — release the machine at shift end, or hand it over to
   the next operator mid-shift (see "Handover flow" below), plus a manual
   "Sync Now".
7. **Crusher Plant tabs** (only shown while the active machine's type is
   Crusher) — **Checklist**: hourly Safety Talk/Plant Checks/Housekeeping/
   Crushing Status sign-off against the current `HourlySlot`. **Breakdown
   Matrix**: hourly multi-select of `BreakdownCause`s (with free text for
   "Other") plus a downtime-minutes figure. **Incidents**: lists open/
   in-progress `BreakdownIncident`s, a "Quick Log Breakdown" fast-path
   button to log a new one, and tapping an existing incident opens the
   attend/resolve flow (see "Breakdown incident hand-off" below).
8. **Offline queue** — every submission saves to an AsyncStorage-backed
   local queue immediately (a `client_uuid` is generated client-side for
   idempotency) and is treated as "saved" from the operator's perspective
   regardless of connectivity. A background sync engine (`src/hooks/
   SyncEngineContext.tsx`) posts queued items to `POST /{resource}/bulk/` on
   reconnect, on a 30s poll, and on app foreground, with capped exponential
   backoff between retries. A shared sync-status bar is visible on every
   session screen; tapping it (or "Sync Now") forces an immediate retry,
   bypassing backoff since that's an explicit request. A `conflict` status
   (distinct from a transient `failed`) is used when the server rejects an
   item for a real reason (e.g. a duplicate slot) — those don't auto-retry.

## Handover flow (why it re-authenticates)

Operators can't list other users via the API (`/api/users/` is
Supervisor+-only), so the incoming operator confirms the handover by
entering **their own** username/password on the outgoing operator's device.
The app verifies those credentials with a throwaway login call to resolve
the incoming operator's user id (needed by `POST /machines/{id}/handover/`),
then adopts those already-verified tokens as the new session — the incoming
operator doesn't have to log in twice.

## Breakdown incident hand-off (why it's a two-step queue operation)

A `BreakdownIncident` is often created by one operator and later attended/
resolved by a different maintenance technician on a different device — the
technician's device never has the operator's client-generated `client_uuid`,
only the server-assigned incident `id` (learned via the **Incidents** tab's
list, which is why that one screen requires connectivity to load — every
other step in this app works offline-first). To support this, the offline
queue (`src/api/queue.ts`) has a second operation kind alongside the usual
create-only one: `enqueue(endpoint, payload, { operation: "update", targetId, actionPath? })`
queues a `PATCH`/action against that known server id instead of a bulk
create, syncing individually rather than batched, but through the exact
same pending/synced/failed/conflict pipeline as everything else — the
technician taps "Mark Attended" or "Mark Resolved" and it's saved locally
immediately, same as any other entry.

## Local development

```bash
cd mobile
npm install
cp .env.example .env   # EXPO_PUBLIC_API_BASE_URL, see below
npx expo start
```

- Press `w` for the web preview (fastest way to check UI changes; also how
  this app was screenshot-tested during development — offline-queue
  behavior works there too, backed by `localStorage`).
- Press `a` for an Android emulator, or scan the QR code with **Expo Go**
  on a real device.
- Demo operator logins (see `backend/seed/management/commands/seed_demo_data.py`):
  `demo_operator1` / `Operator123!`, `demo_operator2` / `Operator123!`.
  `seed_demo_data` only creates accounts — no sites, machines, or
  qualifications — so to reach the Checklist/Breakdown Matrix/Incidents
  tabs you first need a Crusher machine set up and a qualification granted
  to one of these operators for it (`demo_admin`, via the dashboard's
  Master Data > Assign Machines, or Django Admin). For the attend/resolve
  flow specifically, `demo_artisan` / `Artisan123!` is seeded as a
  `maintenance_technician`.

### `EXPO_PUBLIC_API_BASE_URL`

- **Web preview / emulator on the same machine as the backend**:
  `http://localhost:8000/api` (the default in `.env.example`).
- **Real Android device or a separate emulator**: `localhost` won't resolve
  to your dev machine. Use your machine's LAN IP instead, e.g.
  `http://192.168.1.23:8000/api` (find it with `ipconfig` / `ifconfig`), and
  make sure the backend's `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` and your
  firewall allow it. The Android emulator's special host-loopback alias
  `10.0.2.2` also works in place of the LAN IP.

## Building an Android APK

This environment can't produce a signed APK directly (it needs your own
Expo/Google account and a cloud or local Android build). Two paths:

### Option A — EAS Build (managed, recommended)

```bash
cd mobile
npm install -g eas-cli   # or use npx eas-cli
eas login                # your own Expo account
eas build:configure      # first time only — creates eas.json
eas build -p android --profile preview
```

`eas build` runs in Expo's cloud, handles signing (generates/stores a
keystore for you unless you supply one), and gives you a downloadable
`.apk`/`.aab` link when done. Set `EXPO_PUBLIC_API_BASE_URL` for the built
app via `eas.json`'s `env` block per profile (it must point at your
deployed backend, not `localhost`, once it's not running on the same
device/network as the developer machine) — see
[Expo's env docs](https://docs.expo.dev/build-reference/variables/).

### Option B — Local Gradle build (no Expo account)

```bash
cd mobile
npx expo prebuild -p android   # generates the native android/ project
cd android
./gradlew assembleRelease      # requires Android SDK + JDK installed locally
```

The unsigned/debug-signed APK lands in
`android/app/build/outputs/apk/release/`. For a real release build you'll
need to configure your own signing key in `android/app/build.gradle` (see
[Expo's guide on this](https://docs.expo.dev/guides/local-app-production/)).

### CI (GitHub Actions)

A minimal workflow to trigger an EAS build on push, once you have an
`EXPO_TOKEN` secret configured (from `eas login` then `eas whoami --json`,
or generate one at expo.dev/settings/access-tokens):

```yaml
# .github/workflows/eas-build.yml
name: EAS Build
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ["mobile/**"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
        working-directory: mobile
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas build -p android --profile preview --non-interactive
        working-directory: mobile
```

Not included by default in this repo since it requires your own Expo
account/token to do anything — add it under `.github/workflows/` once you
have one.

## Architecture notes

- **Offline queue**: AsyncStorage (not SQLite/WatermelonDB) — the spec
  explicitly allows this for v1, and at shift-log volumes (dozens of
  entries per shift, not thousands) a JSON-array-in-AsyncStorage queue is
  simpler and just as reliable, with no native-module/web-platform-support
  tradeoffs (see `src/api/queue.ts`).
- **One shared sync engine per session** (`src/hooks/SyncEngineContext.tsx`),
  mounted once in `app/session/_layout.tsx` — every screen reads the same
  queue state, so the header's sync badge and each entry list's per-item
  status pill can never disagree about whether something has synced yet.
- **Theme** (`src/theme/theme.ts`): near-black-on-white, bold borders, large
  tap targets (56dp minimum) — chosen deliberately over a "modern"
  muted/dark UI, since maximum contrast is what survives both direct
  underground-mine sunlight glare at the portal and low light further in;
  screen brightness can be raised for dark conditions, but glare can't be
  un-done for a low-contrast UI.
- **Machine-type qualification, not `UserSiteAccess`**: operators typically
  hold zero `UserSiteAccess` grants (that's the Supervisor
  mechanism) — site and machine visibility here is derived from
  `MachineTypeQualification` instead, mirroring the backend's
  `MachineViewSet.get_queryset()` logic (see `app/site-select.tsx` and
  `app/machine-select.tsx`).
