/**
 * UK-friendly number/area formatting:
 *   - hectares primary, acres secondary (toggleable in settings later)
 *   - DD/MM/YYYY dates via date-fns with en-GB locale
 */
import { format as dfFormat, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { enGB } from 'date-fns/locale';

export const HA_TO_AC = 2.47105;

export function formatHa(ha: number | null | undefined): string {
  if (ha === null || ha === undefined || Number.isNaN(ha)) return '—';
  return `${ha.toFixed(2)} ha`;
}

export function formatAc(ha: number | null | undefined): string {
  if (ha === null || ha === undefined || Number.isNaN(ha)) return '—';
  return `${(ha * HA_TO_AC).toFixed(2)} ac`;
}

export function formatArea(
  ha: number | null | undefined,
  primary: 'ha' | 'ac' = 'ha'
): string {
  if (ha === null || ha === undefined) return '—';
  if (primary === 'ha') return `${formatHa(ha)} (${formatAc(ha)})`;
  return `${formatAc(ha)} (${formatHa(ha)})`;
}

/** Format a length in metres. Shows "123 m" under 1 km, "1.23 km" above. */
export function formatLength(m: number | null | undefined): string {
  if (m === null || m === undefined || Number.isNaN(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

/** Human-readable duration for a start/end pair, e.g. "43 days", "3 weeks". */
export function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export function formatDate(iso: string, fmt = 'dd/MM/yyyy'): string {
  return dfFormat(parseISO(iso), fmt, { locale: enGB });
}

export function formatDateTime(iso: string): string {
  return dfFormat(parseISO(iso), "dd/MM/yyyy 'at' HH:mm", { locale: enGB });
}

export function formatRelative(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, locale: enGB });
  } catch {
    return iso;
  }
}

/** ISO string for an <input type="datetime-local"> value. */
export function toDatetimeLocalInput(iso: string): string {
  const d = parseISO(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Convert a <input type="datetime-local"> value (local wall time) to an ISO string. */
export function fromDatetimeLocalInput(value: string): string {
  // new Date(value) treats the no-TZ string as local wall time.
  return new Date(value).toISOString();
}
