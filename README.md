# Mining Production Tracking System

A digital replacement for the manual Excel shift reports (Daily Production
Report, Hauling/Trucking/Breakdown Shift Report) used on an underground
mining operation. Machine operators log production data on an Android app
during their shift; managers/supervisors view live and historical
production on a web dashboard. All master data (sites, sections, machine
types, machines, parameters, teams, shifts) is admin-configurable — nothing
is hardcoded. A Crushing & Breakdowns module extends the same system with
an hourly crusher-plant checklist, an hourly breakdown-cause matrix, a
detailed breakdown/maintenance incident log (MTTR/MTBF), and per-shift
crushing summaries — see the "Crushing & Breakdowns module" note below.

**Status**: all three parts are complete and tested — the Django/DRF backend
(Phase A), the React manager dashboard (Phase B), and the React Native
(Expo) operator app (Phase C) — plus the Crushing & Breakdowns module
extending all three.

## Repository layout

```
backend/              Django + DRF API
dashboard/             React (Vite + TS) manager dashboard
mobile/                React Native (Expo) operator app
docker-compose.yml     postgres + redis + backend + celery-worker + celery-beat + dashboard
.env.example           env vars for docker-compose
docs/
  openapi-schema.yaml  generated OpenAPI 3 spec — import into Postman/Thunder Client
```

## Full stack — quick start (Docker, recommended)

One command brings up Postgres, Redis, the Django API, Celery worker+beat,
and the dashboard dev server:

```bash
cp .env.example .env
# review .env — SEED_DEMO=true will load demo data on first boot
docker compose up --build
```

- Dashboard: http://localhost:5173
- API: http://localhost:8000/api/
- Swagger UI: http://localhost:8000/api/docs/
- Django Admin: http://localhost:8000/admin/
- Demo users (only created when `SEED_DEMO=true`; see
  `backend/seed/management/commands/seed_demo_data.py` for the full list
  and passwords): `demo_admin`, `demo_manager`, `demo_supervisor`,
  `demo_operator1`, `demo_operator2`, `demo_artisan` (a maintenance
  technician, for the Crushing & Breakdowns module).
- No Django superuser is auto-created; if you need raw Django Admin access
  beyond `demo_admin`, run:
  ```bash
  docker compose exec backend python manage.py createsuperuser
  ```
- The mobile app isn't in `docker-compose.yml` — a phone/emulator needs
  direct network reachability to the Expo dev server, which Docker's
  networking works against. Run it separately (see below).

## Backend — local (non-Docker) quick start

Useful if Docker isn't available. Runs against SQLite and an in-memory
cache/eager Celery by default — no Postgres/Redis required.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements/dev.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_groups
python manage.py createsuperuser
python manage.py seed_demo_data --with-entries   # optional demo data
python manage.py runserver
```

Run the test suite:

```bash
cd backend
pytest
```

To run against real Postgres/Redis locally instead of SQLite/eager mode,
set `DATABASE_URL` and `REDIS_URL` in `backend/.env` (see the comments in
`backend/.env.example`).

## Dashboard — local (non-Docker) quick start

Requires the backend running (Docker or local) on `http://localhost:8000`.

```bash
cd dashboard
npm install
cp .env.example .env    # VITE_API_BASE_URL, defaults to http://localhost:8000/api
npm run dev
```

Open `http://localhost:5173`, log in with any of the seeded demo users
(`demo_admin` / `Admin123!`, `demo_manager` / `Manager123!`,
`demo_supervisor` / `Supervisor123!` — see `seed_demo_data.py` for the full
list). Build for production with `npm run build` (outputs to `dashboard/dist`).

### Dashboard architecture notes

- **Auth**: JWT access/refresh stored in `localStorage`; an axios response
  interceptor (`src/lib/api.ts`) transparently refreshes an expired access
  token and retries the original request once, redirecting to `/login` only
  if the refresh itself fails.
- **Role gating**: mirrors the backend's Admin/Manager/Supervisor/Operator
  groups (`src/auth/useAuth.ts::hasRole`) — used both to hide nav items/
  buttons and to guard entire routes (`src/auth/ProtectedRoute.tsx`). This is
  UX convenience only; the backend independently re-enforces every
  permission, so hiding a button here is not the security boundary.
- **Master-data screens**: one generic, config-driven CRUD table
  (`src/components/masterdata/MasterDataTable.tsx`) drives all ~14 master-data
  resources (sites, sections, machine types, parameters, teams, shifts,
  plan targets, …) — each page is just a column/field config, not a
  hand-rolled form, so adding a new master-data type is a ~30-line file.
- **Charts**: Recharts, one y-axis per chart always (never dual-axis) —
  the Live Shift View is deliberately a table, not a chart, because it
  compares parameters with heterogeneous units (tonnes, counts, metres) that
  can't share one axis meaningfully; Trends/Availability/Downtime charts
  each hold one homogeneous unit. Palette and mark choices follow the
  project's dataviz guidelines (validated categorical/status colors, no
  color-only status distinctions).
- **Drill-down**: clicking a production entry or breakdown log opens its
  full raw record plus an edit-history panel backed by
  `GET /api/audit-log/?action=<model_name>&object_id=<id>`.

## Environment variables

See `.env.example` (Docker/production), `backend/.env.example` (local
backend dev), and `dashboard/.env.example` (local dashboard dev) for the
full list. Key ones:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Django secret key |
| `VITE_API_BASE_URL` | Dashboard: backend API base URL (default `http://localhost:8000/api`) |
| `DEBUG` | `true` for local dev only |
| `DATABASE_URL` | Postgres connection string (omit for local SQLite) |
| `REDIS_URL` | Celery broker/result backend + cache (omit for local eager/locmem) |
| `SEED_DEMO` | `true` to load demo master data on container start |
| `CORS_ALLOWED_ORIGINS` | Origins allowed to call the API (e.g. the Vite dev server) |
| `CRUSHER_SLA_UNATTENDED_MINUTES` | Crushing & Breakdowns module: minutes an open `BreakdownIncident` may go unattended before the SLA-notification Celery task flags it (default `30`) |

## API documentation

- Swagger UI: `/api/docs/`
- ReDoc: `/api/redoc/`
- Raw OpenAPI schema: `/api/schema/`, also checked into
  `docs/openapi-schema.yaml` — **import this file directly into Postman or
  Thunder Client** (both support "Import > OpenAPI 3" natively) to get a
  full, ready-to-use request collection instead of a hand-maintained one
  that drifts from the code.

Regenerate the checked-in schema after changing any API surface:

```bash
cd backend
python manage.py spectacular --file ../docs/openapi-schema.yaml
```

## Architecture notes (backend)

- **Eleven Django apps**: `core` (shared permissions/scoping/utilities),
  `accounts`, `masterdata`, `machines`, `teams`, `shiftmgmt`, `planning`,
  `entries`, `audit`, `dashboard`, `crusher_ops`. See inline docstrings/comments
  in each app for the reasoning behind non-obvious decisions (the dynamic-parameter
  EAV schema in `entries/models.py`, the machine-activation concurrency
  handling in `machines/services.py`, the RBAC scoping in `core/mixins.py`
  and `core/scoping.py`).
- **Crushing & Breakdowns module** (`crusher_ops`): plugs into the same
  Site/Section/Machine/Shift/ShiftInstance/User models — a "crusher" is
  simply a `machines.Machine` of machine type `Crusher`, not a separate
  table. Adds an hourly plant checklist (`HourlyChecklistEntry` against
  admin-configurable `ChecklistItem`s and per-site `HourlySlot`s), an
  hourly breakdown-cause matrix (`HourlyBreakdownEntry` against
  admin-configurable `BreakdownCause`s), a detailed maintenance-workflow
  incident log (`BreakdownIncident`, occurred→reported→attended→completed,
  for MTTR/MTBF — distinct from the simpler fleet-wide `entries.BreakdownLog`),
  and per-shift crushing totals (`ShiftCrushingSummary`, tonnage
  auto-summed from the existing `CrusherEntry` throughput data).
  `accounts.User.maintenance_technician` flags who can be assigned as an
  incident's artisan. A Celery task (`crusher_ops.tasks.notify_unattended_breakdown_incidents`,
  every 15 min) flags incidents left unattended past
  `CRUSHER_SLA_UNATTENDED_MINUTES`. Dashboard: a "Crusher Plant" nav
  section (summary cards, breakdown Pareto by cause, MTTR/MTBF trend,
  checklist compliance heat-map, open-incidents list with inline artisan
  assignment, PDF export). Mobile: Checklist/Breakdown Matrix/Incidents
  tabs appear only while operating a crusher machine; a "Quick Log
  Breakdown" fast path and an artisan attend/resolve flow that can span
  two different operators' devices (see `mobile/README.md`).
- **RBAC**: Admin/Manager/Supervisor/Operator via Django Groups, enforced
  by DRF permission classes plus per-viewset queryset scoping — a
  Supervisor for one site cannot see or edit another site's data (see
  `machines/tests.py` and `entries/tests.py` for the regression tests
  proving this).
- **Dynamic master data**: sites, sections, machine types, machines,
  parameters, teams, and shifts are all DB-backed and CRUD-manageable via
  both the REST API and Django Admin — nothing is hardcoded in
  frontend/backend logic. The mobile/web form for a given machine
  type+section is driven entirely by
  `GET /api/machine-types/{id}/form-schema/?section={id}`.
- **Offline-sync contract**: every entry table carries a `client_uuid`
  idempotency key; `POST /api/{production-entries,breakdown-logs,
  crusher-entries,delivery-entries}/bulk/` accepts a batch and returns a
  per-item success/failure array.
- **Audit trail**: django-simple-history on domain models (field-level
  who/when/old/new diffs) bridged into a queryable `AuditLog` timeline at
  `/api/audit-log/` (see `audit/`).

## Mobile (operator) app — quick start

Requires the backend running on `http://localhost:8000`.

```bash
cd mobile
npm install
cp .env.example .env    # EXPO_PUBLIC_API_BASE_URL
npx expo start
```

Press `w` for a web preview, `a` for an Android emulator, or scan the QR
code with Expo Go on a real device. Demo operator logins: `demo_operator1`
/ `Operator123!`, `demo_operator2` / `Operator123!`. See
[`mobile/README.md`](mobile/README.md) for the full walkthrough, offline-sync
architecture notes, and Android APK build instructions (EAS Build and local
Gradle build — this environment can't produce a signed APK directly since
that needs your own Expo/Google account).
