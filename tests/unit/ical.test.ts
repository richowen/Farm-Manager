import { describe, it, expect } from 'vitest';
import { escapeIcsText, foldLine, tasksToIcs, toIcsUtc } from '../../src/lib/server/ical';
import type { TaskWithLocation } from '../../src/lib/server/ical';

describe('escapeIcsText', () => {
  it('escapes commas, semicolons, backslashes, newlines', () => {
    expect(escapeIcsText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
  });
  it('escapes backslash before anything else so \\n is not double-escaped', () => {
    expect(escapeIcsText('path\\to\\file')).toBe('path\\\\to\\\\file');
  });
  it('handles empty input', () => {
    expect(escapeIcsText('')).toBe('');
  });
});

describe('foldLine', () => {
  it('leaves short lines untouched', () => {
    expect(foldLine('SHORT:line')).toBe('SHORT:line');
  });
  it('folds lines longer than 75 octets with CRLF + space', () => {
    const long = 'X'.repeat(200);
    const out = foldLine(`SUMMARY:${long}`);
    for (const part of out.split('\r\n')) {
      expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(out.split('\r\n')[1].startsWith(' ')).toBe(true);
  });
  it('measures UTF-8 bytes, not code units', () => {
    // 30× the 4-byte "🐄" = 120 octets, which must fold.
    const cows = '🐄'.repeat(30);
    const out = foldLine(`SUMMARY:${cows}`);
    expect(out.includes('\r\n ')).toBe(true);
    // Reassembling must equal the original text minus folding artefacts.
    const reassembled = out.replace(/\r\n /g, '');
    expect(reassembled).toBe(`SUMMARY:${cows}`);
  });
});

describe('toIcsUtc', () => {
  it('formats as YYYYMMDDTHHMMSSZ', () => {
    expect(toIcsUtc('2026-04-29T13:45:07.123Z')).toBe('20260429T134507Z');
  });
});

function mkTask(over: Partial<TaskWithLocation> = {}): TaskWithLocation {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Fix fence',
    notes: null,
    due_at: '2026-05-01T09:00:00.000Z',
    location_id: null,
    done_at: null,
    recurrence: 'none',
    created_at: '2026-04-29T00:00:00.000Z',
    updated_at: '2026-04-29T00:00:00.000Z',
    ...over
  };
}

describe('tasksToIcs', () => {
  it('produces a minimally valid VCALENDAR', () => {
    const out = tasksToIcs([mkTask()], 'https://example.com');
    expect(out.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(out.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(out).toContain('UID:task-00000000-0000-4000-8000-000000000001@farm-manager');
    expect(out).toContain('DTSTART:20260501T090000Z');
    expect(out).toContain('SUMMARY:Fix fence');
    expect(out).toContain('STATUS:NEEDS-ACTION');
  });

  it('appends [done] prefix and COMPLETED status for closed tasks', () => {
    const out = tasksToIcs([mkTask({ done_at: '2026-05-02T09:00:00Z' })], '');
    expect(out).toContain('SUMMARY:[done] Fix fence');
    expect(out).toContain('STATUS:COMPLETED');
    expect(out).not.toContain('RRULE:');
  });

  it('maps recurrence to RRULE', () => {
    expect(tasksToIcs([mkTask({ recurrence: 'weekly' })], '')).toContain(
      'RRULE:FREQ=WEEKLY'
    );
    expect(tasksToIcs([mkTask({ recurrence: 'monthly' })], '')).toContain(
      'RRULE:FREQ=MONTHLY'
    );
    expect(tasksToIcs([mkTask({ recurrence: 'yearly' })], '')).toContain(
      'RRULE:FREQ=YEARLY'
    );
  });

  it('includes location name in SUMMARY and LOCATION', () => {
    const out = tasksToIcs(
      [mkTask({ location_name: 'Top Meadow' })],
      'https://example.com'
    );
    expect(out).toContain('SUMMARY:Fix fence [Top Meadow]');
    expect(out).toContain('LOCATION:Top Meadow');
  });

  it('escapes special characters in SUMMARY', () => {
    const out = tasksToIcs([mkTask({ title: 'buy, feed; stop' })], '');
    expect(out).toContain('SUMMARY:buy\\, feed\\; stop');
  });

  it('uses CRLF line endings as required by RFC 5545', () => {
    const out = tasksToIcs([mkTask()], '');
    expect(out.includes('\r\n')).toBe(true);
  });
});
