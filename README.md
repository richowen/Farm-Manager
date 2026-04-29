# Farm Manager

A self-hosted, installable PWA for drawing and managing fields, sheds, and
lines on a satellite map, logging timestamped events (fertilizer, slurry,
cattle in/out, silage, reseed, …) with photos, tracking field use history
(grazing / mowing / …), and managing tasks with a feed that plugs into
Google / Apple / Outlook Calendar.

- **Stack:** SvelteKit (Node adapter) + PostgreSQL/PostGIS
- **Map:** Leaflet + Esri World Imagery (no API key) with an OSM fallback
- **Draw/edit:** Leaflet-Geoman (fields, lines, sheds), multi-select with
  rectangle lasso, colour-by-current-use toggle
- **Photos:** `sharp` pipeline — strips EXIF, auto-rotates, downscales
  >2000 px, re-encodes JPEG q85; served via auth-gated `/uploads/*`
- **Calendar:** read-only iCalendar feed at `/calendar.ics?token=…` for
  tasks, with RRULE mapping for weekly / monthly / yearly recurrence
- **Auth:** single-user, env-configured password, signed-cookie session
- **Data:** Postgres with PostGIS; geometry stored as `GEOGRAPHY(_, 4326)`
  so area/length calculations are in metres without reprojection
- **PWA:** installable app shell with runtime tile caching and a mobile
  bottom-tab bar (Map / Timeline / Tasks / More)

## Quick start (any Docker host)

1. Copy `.env.example` to `.env` and fill in the required values:
   - `DB_PASSWORD` — Postgres password
   - `APP_PASSWORD` — the password you'll use to log in to the app
   - `SESSION_SECRET` — generate with `openssl rand -hex 32`
   - `ORIGIN` — **required**, e.g. `http://192.168.1.81:3000` or
     `https://farm.example.com`
2. `docker compose up -d`
3. Browse to `http://<host>:3000`, log in with `APP_PASSWORD`, and draw your
   first field.

The database migrations (including `CREATE EXTENSION postgis`) run
automatically on first boot, so there's no manual setup step.

Photo uploads are written to `/data/uploads` inside the container, backed by
the `farm_uploads` named volume. The compose file also mounts this volume by
default.

## Self-hosting on Unraid

Two paths:

### Option A — Built-in Docker Manager (no plugins required)

The `unraid/` folder in this repo contains:
- `farm-manager-db.xml` — PostGIS database container template
- `farm-manager-app.xml` — Farm Manager app container template
- `SETUP.txt` — full step-by-step setup guide

The short version:

1. Open the Unraid terminal and run **once**:
   ```
   docker network create farm-manager
   mkdir -p /mnt/user/appdata/farm-manager/db
   mkdir -p /mnt/user/appdata/farm-manager/uploads
   openssl rand -hex 32    # copy the output — this is your SESSION_SECRET
   ```
2. **Add container** → fill from `farm-manager-db.xml`
   (or paste values by hand; repository `postgis/postgis:16-3.4`,
   network `farm-manager`, bind `POSTGRES_PASSWORD`).
3. **Add container** → fill from `farm-manager-app.xml`
   (repository `ghcr.io/<you>/farm-manager:latest`, network `farm-manager`,
   bind `/data/uploads` → `/mnt/user/appdata/farm-manager/uploads`, set
   `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, `ORIGIN`).
4. Browse to `http://<unraid-ip>:3000`.

### Option B — Compose Manager plugin

1. Install the **Compose Manager** plugin from Community Apps.
2. Create `/mnt/user/appdata/farm-manager/` (plus `db/` and `uploads/` inside)
   and copy in `docker-compose.unraid-example.yml` and your `.env`.
3. Replace `ghcr.io/<you>/farm-manager:latest` with the image tag matching
   your repo (or build locally and push).
4. Start the stack from the plugin UI.

### Backups

- **Full logical backup (recommended):** the Settings page has a
  "Download full backup (.json)" button that produces a single JSON file
  containing all locations, events, field-use history, tasks, and settings
  (format `v2`). Restore via the same page. v1 backups (from 0.1) still
  import cleanly.
- **Photos** live on disk in the uploads volume and are *not* in the JSON
  export. Back up `/mnt/user/appdata/farm-manager/uploads/` (on Unraid via
  the Appdata Backup plugin, or the compose `farm_uploads` volume).
- **Database dump:** `docker exec -t farm-manager-db pg_dumpall -U farm > dump.sql`

## Subscribing to tasks from Google / Apple / Outlook Calendar

Farm Manager exposes your open tasks (and recently-completed ones from the
last 30 days) as a read-only iCalendar feed.

1. Go to **Settings → Calendar feed** and click **Generate feed URL**.
2. Copy the URL — it looks like
   `https://farm.example.com/calendar.ics?token=…`.
3. Paste it into your calendar app:
   - **Google Calendar** (desktop): Other calendars → `+` → *From URL* →
     paste → Add
   - **Apple Calendar**: File → *New Calendar Subscription* → paste
   - **Outlook**: Add calendar → *Subscribe from web* → paste

Notes:
- Calendar apps poll the feed at their own cadence (hours, not minutes).
- The feed is **read-only**: ticking a task done in your calendar does *not*
  mark it done in Farm Manager. Use the `/tasks` page (add it to your home
  screen for quick access).
- Anyone with the URL can read your tasks. Keep it private — rotate or
  disable the token any time from the same Settings section.
- The URL only works if `ORIGIN` is set so the embedded deep-links
  (`Open in Farm Manager: …/tasks#<id>`) resolve.

## Development

```bash
# Start a local Postgres + PostGIS for dev
docker run --rm -d --name farm-pg -e POSTGRES_USER=farm -e POSTGRES_PASSWORD=farm \
  -e POSTGRES_DB=farm -p 5432:5432 postgis/postgis:16-3.4

# Env for `npm run dev`
export DATABASE_URL=postgres://farm:farm@127.0.0.1:5432/farm
export APP_PASSWORD=dev
export SESSION_SECRET=$(openssl rand -hex 32)
export ORIGIN=http://localhost:5173

npm install
npm run dev          # Vite dev server on :5173
npm run test:unit    # Vitest unit tests (schemas, iCal, recurrence, geometry)
npm run build && npm run preview  # production build smoke test
npm run test:e2e     # Playwright smoke tests
```

### Data model

- `locations(id, kind, name, color, notes, tags, geom, area_ha, …)` —
  unified table for fields, sheds, and lines; `kind = 'field' | 'shed' |
  'line'`. Lines store a `LineString`; area_ha is NULL for shed/line;
  length_m is derived at SELECT time for lines via `ST_Length(geom)`.
- `field_uses(id, location_id, use_type, started_at, ended_at, notes,
  metadata, …)` — history of use periods; a partial unique index on
  `location_id WHERE ended_at IS NULL` enforces one open period per field.
- `events(id, location_id?, occurred_at, event_type, notes, metadata,
  photos, batch_id, …)` — `location_id` is now nullable for standalone GPS
  events; `photos` is a JSONB array of `{path, w, h, size}` refs; `batch_id`
  groups events created together in a multi-field batch.
- `tasks(id, title, notes, due_at, location_id, done_at, recurrence, …)` —
  one row per task; completing a recurring one inserts the next row via the
  `nextOccurrence` helper.
- `settings(id=1, data, password_hash)` — single-row preferences (use type
  list, use colours, iCal feed token, …) plus an optional hashed password
  override.

All geometries are transported as GeoJSON. On the way in/out of Postgres we
use `ST_GeomFromGeoJSON` / `ST_AsGeoJSON` at the repository boundary.

### Event types

`fertilizer`, `slurry`, `lime`, `spray`, `worming`, `vet_treatment`,
`cattle_in`, `cattle_out`, `turn_out_to_grass`, `housed`, `grazing_start`,
`grazing_end`, `topping`, `harvest_silage`, `harvest_hay`, `reseed`,
`fencing`, `inspection`, `other`.

Each has a display label, icon, and colour defined in
`src/lib/utils/event-types.ts`.

### Scope (explicitly **not** included)

Per the original requirements:

- Individual animal IDs / ear tags
- Medicine books, health records
- APHA / BCMS movement reporting
- Statutory compliance exports
- Two-way Google Calendar sync (iCal feed is read-only)
- Push notifications (out of scope for v0.2 — may come in v0.3)

Cattle movement events are headcount-only (stored in `metadata.count`).
"Mob" is stored as free text on grazing field_use metadata.

## Tiles and terms of service

- **Esri World Imagery** is free for low-volume use and does not require an
  API key. Runtime caching in the service worker is capped at ~200 tiles /
  30 days, which is within Esri's "limited caching for performance" allowance.
  The app does not offer bulk/offline pre-fetching of tiles.
- **OpenStreetMap** is available as a fallback layer (Settings → Default base
  layer) for areas where Esri imagery is cloudy or outdated.

## License

MIT
