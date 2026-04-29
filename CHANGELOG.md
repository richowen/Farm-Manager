# Changelog

All notable changes are listed here. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-04

### Added

- **Worming schedule reminders.** When logging a `worming` event, a new
  "Schedule worming reminders" checkbox appears below the product field. Check
  it, set the repeat interval (default 42 days / 6 weeks) and an end date, and
  tasks are automatically created on the Tasks page — one per interval — with
  the field name and product in the title/notes. Each batch is created
  concurrently and a toast confirms how many reminders were scheduled. Schedules
  are per-field and fully independent.
- **Tasks link in desktop TopBar.** The ✓ (tasks) icon now appears in the pill
  beside Settings on screens ≥ 640 px wide. Previously it was only reachable
  via the mobile bottom nav.

### Fixed

- **"Add event" popup now scrolls on mobile.** The flex child hosting the
  event form lacked `min-h-0`, which prevented `overflow-y-auto` from taking
  effect. Combined with switching from `vh` to `dvh` units (so the panel
  height accounts for the on-screen keyboard), the Submit button is always
  reachable by scrolling.
- **"Pipes hidden" chip removed from map.** The `HiddenLinesChip` overlay in
  the bottom-left corner of the map has been removed; pipe/drain visibility is
  still controlled from the TopBar toggle.

## [0.3.3] — 2026-04

### Fixed

- **Mobile toolbar no longer overflows or clips.** The draw toolbar (Field /
  Shed / Pipe / Drain / Pin / Select / Edit) now wraps to a second row on
  narrow screens instead of being cut off. The outer container is capped at
  `calc(100vw - 2rem)` so it never escapes the screen edge.
- **FAB clears the toolbar on mobile.** The "I am here" button is raised by
  `5.5rem` above the nav bar on mobile (vs `1rem` on desktop) so it sits above
  even a two-row wrapped toolbar and is never covered.
- **TopBar fits without clipping on small phones.** The Timeline and Settings
  links are now hidden on mobile (`sm:hidden`) because they are already
  accessible from the MobileNav tab bar. The reduced button count keeps the
  pill well within the screen width on all current phone sizes.
- **Viewport height no longer jumps on iOS/Android.** Map height changed from
  `h-screen` (includes browser chrome) to `h-[100dvh]` (dynamic viewport
  height) so the map doesn't resize as the address bar appears/disappears.
- **Offline banner moved to top.** The "Offline" status pill now appears below
  the TopBar (`top: 4.5rem`) rather than at the bottom where it was covered by
  the draw toolbar.

## [0.3.2] — 2026-04

### Changed

- **Image upload quality reduced to 50%.** Client-side resize now encodes at
  JPEG quality 50 (down from 85) to further reduce upload size.

## [0.3.1] — 2026-04

### Fixed

- **Client-side image resize before upload.** Photos are now downscaled to a
  maximum of 1920×1920 px and re-encoded as JPEG (quality 85) in the browser
  before being sent to the server. This prevents SvelteKit 413 errors when
  uploading large images (e.g. 887 KB uncompressed) that exceed the default
  524 KB body limit. EXIF orientation is applied during resize so photos from
  iOS/Android cameras are always correctly rotated.

## [0.3.0] — 2026-04

### Added

- **Pins — geolocated notes with status, category, and photos.** A new pin
  entity lives alongside fields, sheds, and lines. Each pin carries a
  3-state status (**to-do / done / note**), an editable category, an
  optional title + notes body, and up to 20 photos. Pins are independent
  of fields; deleting a field sets the snapshot `location_id` to `NULL`
  rather than cascading.
- **Three ways to drop a pin.** The "I am here" FAB now shows a chooser
  ("Log event in *Field*" / "Drop pin here") after GPS lock. A new **Pin**
  button on the draw toolbar consumes the next map tap. And long-pressing
  the map (~600 ms, ≤10 px movement) drops a pin at that spot, with a
  touch-friendly vibration cue.
- **Coloured teardrop markers.** Outer shape is the status colour (orange
  to-do, green done, slate note); inner dot is the category colour so
  both facets are readable at a glance. Completed pins render at 60%
  opacity so they recede without disappearing.
- **Pin detail sheet** with primary-action row (Mark done / Re-open /
  Convert to note) and a pencil button that opens the full edit modal.
  Delete requires confirmation. Bottom-sheet on mobile, right panel on
  desktop.
- **`/pins` list page** — browse every pin grouped by status, with
  category and location filters. Tapping a row navigates back to the map
  via `?pin=<id>` and opens its detail sheet.
- **5-tab mobile nav.** Map / Timeline / Tasks / **Pins** / More.
- **Map toggles.** Top bar gains a pin toggle and a show-completed toggle;
  both persist via the new `showPins` and `showDonePins` settings flags
  (default on).
- **Editable pin categories.** Settings page has a new Pins section where
  categories and their colours can be edited or removed. 8 defaults ship
  out of the box: `repair`, `restock`, `check`, `observation`, `hazard`,
  `livestock-health`, `crop-issue`, `general`.
- **Pin round-trip through JSON export/import.** Export bumped to **v3**;
  v1/v2 backups still import correctly. Replace-mode import now truncates
  pins alongside the other tables.

### Scoped out (deferred)

- Pin clustering at low zoom, pin drag-to-reposition, offline create /
  outbox queue, pin-to-event linking, searchable pin text index. All
  tracked for follow-up releases.

## [0.2.2] — 2026-04

### Fixed

- **HEIC/HEIF photo uploads now accepted.** `image/heic` and `image/heif`
  (the default format on iPhones/iPads) were missing from the accepted MIME
  set, causing a silent `unsupported_type` 400. Sharp re-encodes them to
  JPEG as with other formats — nothing changes on disk.
- **Upload errors are now logged with context.** `request.formData()` failures
  and validation rejections now emit a structured log line (filename, MIME
  type, size, reason) so the actual cause is visible in `docker logs` rather
  than appearing as a generic `invalid_multipart` with no detail.

## [0.2.1] — 2026-04

### Added

- **Pipe / drain line subtypes.** The single "Line" draw button is replaced
  with dedicated **Pipe** and **Drain** buttons. Pipes render as solid blue,
  drains as dashed brown — styling is baked in so they stay legible against
  satellite imagery regardless of the current colour mode. Legacy v0.2.0
  line rows keep rendering with their own colour until you classify them.
- **Branching lines.** A single pipe or drain feature can now have multiple
  branches, each with its own endpoint(s). After drawing the first branch a
  chip offers **+ Branch** / **Finish** / **Cancel**; subsequent branches
  snap to existing vertices so they lock on cleanly. Saved as
  `MultiLineString`; `ST_Length` totals the lot and the detail panel shows
  both the total length and the branch count.
- **Hidden-by-default map layer for lines.** Pipes and drains no longer
  clutter the satellite view. A new toggle in the top bar turns them on or
  off, and a small chip anchored to the bottom-left of the map summarises
  how many are currently hidden so they're never forgotten about. The
  setting is persisted per-user.
- **Legacy line classification dialog.** First visit to Settings after
  upgrading prompts you to bulk-assign any existing `line` rows to
  **pipe** or **drain** (or leave them generic). A new `legacyLinesPrompted`
  settings flag means the dialog never comes back once dismissed.
- **First-boot `showLines` auto-show.** Installs that already had lines in
  v0.2.0 get `showLines` flipped on automatically on the first settings load
  so their existing drainage / pipework network stays visible after upgrade.
  Fresh installs (no line rows) default to hidden.

### Changed

- **Mobile tab bar no longer overlaps bottom UI.** A new `--fm-nav-inset`
  CSS variable reserves space on mobile so the draw toolbar, "I am here"
  FAB, selection chip, use legend, and offline banner all clear the tab
  bar. Full-screen-ish overlays (detail panel, new location modal, batch
  forms, task editor) hide the tab bar while they're open via a new
  reference-counted `overlayCount` store, so the previously-unreachable
  **Save** / **Add event** buttons inside the detail panel now always
  register.
- **New `line_type` batch patch field.** `PATCH /api/locations/batch` now
  accepts `patch.line_type` (`'pipe' | 'drain' | null`) so the classify
  dialog can fix up every legacy row in one request.
- Line stroke-width remains 4 px; drain dash array is `[8, 4]`.

### Infra

- Migration **0009** adds the nullable `line_type` column on `locations`,
  a CHECK constraint scoping it to `kind = 'line'`, and a partial index for
  the two non-null values. No geometry column changes — `geom` already
  accepts `MultiLineString`.

### Upgrade notes

- Migration 0009 runs automatically on first boot; no manual step.
- Any `line` rows saved in v0.2.0 stay valid. Visit **Settings** to
  classify them as pipes or drains (or leave them generic — the prompt is
  one-off and can be skipped).

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
