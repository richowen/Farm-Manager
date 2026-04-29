import type { TaskRecord } from '$lib/schemas';

/**
 * Hand-rolled iCalendar (RFC 5545) serialiser for tasks.
 *
 * Why not a library? Two reasons:
 *   1. We emit a tiny subset (VCALENDAR > N × VEVENT with one optional RRULE)
 *      so the code fits in ~100 lines and is easy to unit-test.
 *   2. Most ICS libraries pull a chain of heavy deps for date maths we don't
 *      need — Google Calendar handles recurrence rendering from the RRULE.
 */

const APP_NAME = 'Farm Manager';
const PRODID = '-//Farm Manager//task feed//EN';

// RFC 5545 §3.3.11: TEXT-typed property values must escape backslash, comma,
// semicolon, and newline. Order matters — do backslash first.
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** UTC timestamp in `YYYYMMDDTHHMMSSZ` form. */
export function toIcsUtc(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * RFC 5545 §3.1 requires content lines to be ≤75 octets. Longer lines must be
 * split with CRLF + a single space continuation byte. We use UTF-8 byte length
 * rather than `.length` because emoji and accented characters occupy multiple
 * octets.
 */
export function foldLine(line: string): string {
  const MAX = 75;
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= MAX) return line;

  const chunks: string[] = [];
  // First chunk gets up to 75 bytes; continuations get up to 74 bytes since
  // the leading space counts toward the 75-octet budget.
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const budget = first ? MAX : MAX - 1;
    // Don't split a UTF-8 multi-byte sequence.
    let end = Math.min(start + budget, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) end--;
    if (end === start) end = Math.min(start + budget, bytes.length); // fallback
    const chunk = bytes.slice(start, end).toString('utf8');
    chunks.push(first ? chunk : ` ${chunk}`);
    start = end;
    first = false;
  }
  return chunks.join('\r\n');
}

function line(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

const RRULE_MAP: Record<TaskRecord['recurrence'], string | null> = {
  none: null,
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY'
};

export interface TaskWithLocation extends TaskRecord {
  /** Optional display name for the linked location. */
  location_name?: string | null;
  /** Optional centroid for the LOCATION geo hint. */
  location_centroid?: { lat: number; lng: number } | null;
}

/**
 * Produce a complete VCALENDAR document for the given tasks. The `origin`
 * must be the absolute public URL of the app (e.g. `https://farm.example.com`)
 * so the DESCRIPTION deep-links work from Google Calendar.
 */
export function tasksToIcs(tasks: TaskWithLocation[], origin: string): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push(`PRODID:${PRODID}`);
  lines.push(`X-WR-CALNAME:${escapeIcsText(APP_NAME)}`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');

  for (const task of tasks) lines.push(...taskToVevent(task, origin));

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function taskToVevent(task: TaskWithLocation, origin: string): string[] {
  const dtstart = toIcsUtc(task.due_at);
  const end = new Date(task.due_at);
  end.setMinutes(end.getMinutes() + 30);
  const dtend = toIcsUtc(end);
  const dtstamp = toIcsUtc(task.updated_at);

  const summaryBase = task.location_name
    ? `${task.title} [${task.location_name}]`
    : task.title;
  const summary = task.done_at ? `[done] ${summaryBase}` : summaryBase;

  // Only include a deep-link when we have a real ORIGIN. With an empty ORIGIN
  // (dev / CI) we'd otherwise emit `Open in Farm Manager: /tasks#<id>`, which
  // calendar clients render as non-clickable plain text.
  const linkLine = origin ? `Open in ${APP_NAME}: ${origin}/tasks#${task.id}` : '';
  const desc = [task.notes, linkLine].filter(Boolean).join('\n\n');

  const out: string[] = [];
  out.push('BEGIN:VEVENT');
  out.push(line('UID', `task-${task.id}@farm-manager`));
  out.push(line('DTSTAMP', dtstamp));
  out.push(line('DTSTART', dtstart));
  out.push(line('DTEND', dtend));
  out.push(line('SUMMARY', escapeIcsText(summary)));
  if (desc) out.push(line('DESCRIPTION', escapeIcsText(desc)));
  if (task.location_name) {
    const loc = task.location_centroid
      ? `${task.location_name} (${task.location_centroid.lat.toFixed(5)}, ${task.location_centroid.lng.toFixed(5)})`
      : task.location_name;
    out.push(line('LOCATION', escapeIcsText(loc)));
    if (task.location_centroid) {
      out.push(
        line(
          'GEO',
          `${task.location_centroid.lat.toFixed(6)};${task.location_centroid.lng.toFixed(6)}`
        )
      );
    }
  }
  out.push(line('STATUS', task.done_at ? 'COMPLETED' : 'NEEDS-ACTION'));
  out.push('CATEGORIES:Farm Manager');
  // For open recurring tasks, emit RRULE. For completed recurring tasks the
  // next task record handles the next occurrence — emitting an RRULE on a
  // closed one would keep the "done" event recurring forever in the calendar.
  if (!task.done_at) {
    const rrule = RRULE_MAP[task.recurrence];
    if (rrule) out.push(line('RRULE', rrule));
  }
  out.push('END:VEVENT');
  return out;
}
