import { describe, it, expect } from 'vitest';
import { nextOccurrence } from '../../src/lib/server/repositories/tasks';

describe('nextOccurrence', () => {
  it('returns null for non-recurring', () => {
    expect(nextOccurrence(new Date('2026-05-01T00:00Z'), 'none', new Date())).toBeNull();
  });

  it('advances weekly from a near-past due date to the next upcoming date', () => {
    const due = new Date('2026-04-27T09:00:00Z');
    const now = new Date('2026-04-29T12:00:00Z');
    const next = nextOccurrence(due, 'weekly', now);
    expect(next).not.toBeNull();
    // One week after the original due is 2026-05-04, which is after now.
    expect(next!.toISOString()).toBe('2026-05-04T09:00:00.000Z');
  });

  it('skips missed cycles for weekly, not adding catch-up tasks', () => {
    const due = new Date('2026-01-01T09:00:00Z');
    const now = new Date('2026-04-29T12:00:00Z');
    const next = nextOccurrence(due, 'weekly', now);
    expect(next).not.toBeNull();
    expect(next!.getTime() > now.getTime()).toBe(true);
    // Must still be at 09:00 on whatever weekday the series lands on.
    expect(next!.getUTCHours()).toBe(9);
  });

  it('handles monthly', () => {
    const due = new Date('2026-01-15T09:00:00Z');
    const now = new Date('2026-04-29T12:00:00Z');
    const next = nextOccurrence(due, 'monthly', now);
    expect(next).not.toBeNull();
    expect(next!.getUTCMonth()).toBe(4); // May (0-indexed)
    expect(next!.getUTCDate()).toBe(15);
  });

  it('handles yearly', () => {
    const due = new Date('2020-05-01T09:00:00Z');
    const now = new Date('2026-04-29T12:00:00Z');
    const next = nextOccurrence(due, 'yearly', now);
    expect(next).not.toBeNull();
    expect(next!.getUTCFullYear()).toBe(2026);
    expect(next!.getUTCMonth()).toBe(4);
    expect(next!.getUTCDate()).toBe(1);
  });
});
