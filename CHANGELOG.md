# Changelog

All notable changes are listed here. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-04

### Added

- **Field use tracking with history.** New `field_uses` table stores structured
  use periods (`grazing`, `mowing`, `hay`, or any type you add in Settings)
  with start/end dates and optional notes. Each field shows its current use as
  a coloured pill and the full history on a dedicated Use tab. Starting a new
  period auto-closes the previous one in a single transaction, enforced by a
  partial unique index on open periods.
- **Map colour-by-current-use toggle.** Swap from location colour to current
  use colour; palette is editable per type in Settings, with a legend on the
  map and hatched/grey rendering for fields with no current use.
- **Batch property edit.** Select multiple fields and change their tags
  (add / remove / replace) or colour in one go, or start the same new use on
  all of them (great for moving a mob to three paddocks at once).
- **Batch event creation.** Log one event (e.g. "Fertiliser 2026") against
  N selected fields in a single request; rows share a `batch_id` so you can
  edit or delete the whole batch as one unit. The toast offers a 10-second
  Undo (single `DELETE /api/events/batch/:id`, idempotent).
- **Line features.** New `line` location kind for pipes, drains, tracks,
  fences, etc. Draw via the same Geoman toolbar; detail panel shows
  auto-computed length in metres and kilometres.
- **"I am here" GPS quick-log.** Floating action button requests your GPS
  position, drops a pulsing marker, auto-selects the containing field
  (point-in-polygon), and pre-fills an event form with the coordinates and
  accuracy hint. Works outside a field too (event stored with
  `location_id = NULL`).
- **Photo attachments on events.** Single or multiple images per event;
  `sharp` strips EXIF (keeping orientation), auto-rotates, downscales
  anything >2000 px on the long edge, and re-encodes as JPEG quality 85.
  Served via an auth-gated `/uploads/*` route with long browser cache headers.
- **Tags on locations.** Free-form `tags TEXT[]` array with autocomplete from
  the existing tag list. Chip input in the New Location modal and Detail
  Panel. Indexed with GIN for future filter work.
- **Tasks & reminders.** New `/tasks` page with tabbed filters (overdue /
  due today / upcoming / done), recurrence (`none`|`weekly`|`monthly`|`yearly`),
  optional location link, inline snooze buttons, and touch swipe-to-delete.
  Completing a recurring task automatically inserts the next occurrence.
  Overdue / due-today banner on the map links to the list.
- **iCal feed for Google / Apple / Outlook calendars.** New
  `GET /calendar.ics?token=<…>` endpoint emits a standards-compliant ICS
  stream (RFC 5545 line folding, text escaping, RRULE mapping). Authenticated
  by a per-user token generated from Settings → Calendar feed. Read-only.
- **Mobile-first polish.** Bottom tab bar on small screens (Map / Timeline /
  Tasks / More), 44×44 px minimum touch targets, `safe-area-inset` padding on
  the FAB and bottom bar, haptic feedback on multi-select toggle.
- **Settings additions.** Editable Use Types list with per-type colour; iCal
  feed token (generate / rotate / disable with copy-URL button and step-by-step
  subscription instructions).

### Changed

- Settings export format bumped to **v2** — now includes `field_uses` and
  `tasks` in the backup. v1 imports still supported (fields just fall back to
  defaults for the missing sections).
- `events.location_id` is now **nullable** to support standalone GPS events.
  Existing rows are unaffected.
- `locations.kind` CHECK constraint relaxed to allow `'line'`.
- The service worker no longer caches `/uploads/*` or `/calendar.ics` —
  photos go straight through to the browser's own cache, and the feed always
  hits the origin so calendar apps get fresh data.

### Infra

- `Dockerfile` creates `/data/uploads` and declares it a `VOLUME`; `vips`
  runtime package added so `sharp` works on arm64-musl without pulling build
  tools. Sets `UPLOAD_DIR=/data/uploads` by default.
- `UPLOAD_DIR`, `UPLOAD_MAX_MB`, `PROTOCOL_HEADER`, `HOST_HEADER` added to
  `.env.example`, docker-compose files, and Unraid template.
- Unraid template adds a visible "Uploads Path" bind mount and reverse-proxy
  header variables for HTTPS deployments.

### Upgrade notes

- **Add the new uploads volume before upgrading** or photos will not persist
  across container recreates. For Unraid bind it to
  `/mnt/user/appdata/farm-manager/uploads`.
- If fronted by a reverse proxy over HTTPS, set `ORIGIN=https://…`,
  `PROTOCOL_HEADER=x-forwarded-proto`, and `HOST_HEADER=x-forwarded-host`.
- Migrations 0005–0008 run automatically on first boot; no manual step
  required.

## [0.1.0] — 2026-04

Initial release. Fields + sheds, events with types + metadata, PostGIS,
single-user auth, installable PWA, Unraid templates.
