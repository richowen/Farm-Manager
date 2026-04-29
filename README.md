# Farm Manager

A self-hosted, installable PWA for drawing and managing fields and sheds on a
satellite map, and logging timestamped events (fertilizer, slurry, cattle in/
out, silage, reseed, …) against each one.

- **Stack:** SvelteKit (Node adapter) + PostgreSQL/PostGIS
- **Map:** Leaflet + Esri World Imagery (no API key) with an OSM fallback
- **Draw/edit:** Leaflet-Geoman
- **Auth:** single-user, env-configured password, signed-cookie session
- **Data:** Postgres with PostGIS; geometry stored as `GEOGRAPHY(_, 4326)`
  so area calculations are in metres without reprojection
- **PWA:** installable app shell with runtime tile caching for recently-viewed
  areas (online-first; writes require a network)

## Quick start (any Docker host)

1. Copy `.env.example` to `.env` and fill in the required values:
   - `DB_PASSWORD` — Postgres password
   - `APP_PASSWORD` — the password you'll use to log in to the app
   - `SESSION_SECRET` — generate with `openssl rand -hex 32`
   - `ORIGIN` (recommended) — e.g. `https://farm.example.com` if reverse-proxied
2. `docker compose up -d`
3. Browse to `http://<host>:3000`, log in with `APP_PASSWORD`, and draw your
   first field.

The database migrations (including `CREATE EXTENSION postgis`) run
automatically on first boot, so there's no manual setup step.

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
   openssl rand -hex 32    # copy the output — this is your SESSION_SECRET
   ```
2. **Add container** → fill from `farm-manager-db.xml`
   (or paste values by hand; repository `postgis/postgis:16-3.4`,
   network `farm-manager`, bind `POSTGRES_PASSWORD`).
3. **Add container** → fill from `farm-manager-app.xml`
   (repository `ghcr.io/<you>/farm-manager:latest`, network `farm-manager`,
   set `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`).
4. Browse to `http://<unraid-ip>:3000`.

### Option B — Compose Manager plugin

1. Install the **Compose Manager** plugin from Community Apps.
2. Create `/mnt/user/appdata/farm-manager/` and copy in
   `docker-compose.unraid-example.yml` and your `.env`.
3. Replace `ghcr.io/<you>/farm-manager:latest` with the image tag matching
   your repo (or build locally and push).
4. Start the stack from the plugin UI.

### Backups

- **Full logical backup (recommended):** the Settings page has a
  "Download full backup (.json)" button that produces a single JSON file
  containing all locations, events, and settings. Restore via the same page.
- **Database dump:** `docker exec -t farm-manager-db pg_dumpall -U farm > dump.sql`
- **Bind-mount snapshot:** `/mnt/user/appdata/farm-manager/db/` contains the
  Postgres data directory when using `docker-compose.unraid-example.yml`.

## Development

```bash
# Start a local Postgres + PostGIS for dev
docker run --rm -d --name farm-pg -e POSTGRES_USER=farm -e POSTGRES_PASSWORD=farm \
  -e POSTGRES_DB=farm -p 5432:5432 postgis/postgis:16-3.4

# Env for `npm run dev`
export DATABASE_URL=postgres://farm:farm@127.0.0.1:5432/farm
export APP_PASSWORD=dev
export SESSION_SECRET=$(openssl rand -hex 32)

npm install
npm run dev          # Vite dev server on :5173
npm run test:unit    # Vitest unit tests
npm run build && npm run preview  # production build smoke test
npm run test:e2e     # Playwright smoke tests
```

### Data model

- `locations(id, kind, name, color, notes, geom, area_ha, ...)` — unified table
  for both fields and sheds; `kind = 'field' | 'shed'`.
- `events(id, location_id, occurred_at, event_type, notes, metadata, ...)` —
  timestamped entries; `metadata` is `jsonb` for event-type-specific extras
  (e.g. `{ product, rate_kg_ha }` for fertilizer) without schema churn.
- `settings(id=1, data, password_hash)` — single-row user preferences plus an
  optional hashed password override set from the Settings page.

All geometries are transported as GeoJSON. On the way in/out of Postgres we
use `ST_GeomFromGeoJSON` / `ST_AsGeoJSON` at the repository boundary. Fields
use `Polygon`/`MultiPolygon`; sheds use `Point`.

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

Cattle movement events are headcount-only (stored in `metadata.count`).

## Tiles and terms of service

- **Esri World Imagery** is free for low-volume use and does not require an
  API key. Runtime caching in the service worker is capped at ~200 tiles /
  30 days, which is within Esri's "limited caching for performance" allowance.
  The app does not offer bulk/offline pre-fetching of tiles.
- **OpenStreetMap** is available as a fallback layer (Settings → Default base
  layer) for areas where Esri imagery is cloudy or outdated.

## License

MIT
