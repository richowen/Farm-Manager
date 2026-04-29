import { describe, it, expect } from 'vitest';
import {
  createPinSchema,
  updatePinSchema,
  pinStatusSchema,
  userSettingsSchema,
  DEFAULT_PIN_CATEGORIES
} from '../../src/lib/schemas';

describe('createPinSchema', () => {
  it('accepts a minimal { coords, status } payload', () => {
    const r = createPinSchema.safeParse({
      coords: [-1.2, 52.3],
      status: 'todo'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('todo');
  });

  it('defaults status to todo when omitted', () => {
    const r = createPinSchema.safeParse({ coords: [0, 0] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('todo');
  });

  it('rejects out-of-range longitude', () => {
    const r = createPinSchema.safeParse({ coords: [181, 0], status: 'todo' });
    expect(r.success).toBe(false);
  });

  it('rejects out-of-range latitude', () => {
    const r = createPinSchema.safeParse({ coords: [0, -91], status: 'todo' });
    expect(r.success).toBe(false);
  });

  it("rejects status 'banana'", () => {
    const r = createPinSchema.safeParse({ coords: [0, 0], status: 'banana' });
    expect(r.success).toBe(false);
  });

  it('rejects more than 20 photos', () => {
    const photo = { path: '2026/04/a.jpg', w: 1, h: 1, size: 1 };
    const r = createPinSchema.safeParse({
      coords: [0, 0],
      status: 'todo',
      photos: new Array(21).fill(photo)
    });
    expect(r.success).toBe(false);
  });
});

describe('updatePinSchema', () => {
  it('accepts an empty patch', () => {
    const r = updatePinSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('round-trips a coords update', () => {
    const r = updatePinSchema.safeParse({ coords: [1.23, 45.67] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.coords).toEqual([1.23, 45.67]);
  });

  it('enforces the 20-photo cap', () => {
    const photo = { path: '2026/04/a.jpg', w: 1, h: 1, size: 1 };
    const r = updatePinSchema.safeParse({ photos: new Array(21).fill(photo) });
    expect(r.success).toBe(false);
  });

  it('allows clearing the title via null', () => {
    const r = updatePinSchema.safeParse({ title: null });
    expect(r.success).toBe(true);
  });
});

describe('pinStatusSchema', () => {
  it("accepts 'note'", () => {
    expect(pinStatusSchema.safeParse('note').success).toBe(true);
  });
  it("rejects 'archived'", () => {
    expect(pinStatusSchema.safeParse('archived').success).toBe(false);
  });
});

describe('userSettingsSchema pin defaults', () => {
  it('defaults pinCategories to the 8-item whitelist', () => {
    const r = userSettingsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pinCategories).toHaveLength(DEFAULT_PIN_CATEGORIES.length);
      expect(r.data.pinCategories).toEqual([...DEFAULT_PIN_CATEGORIES]);
    }
  });

  it('defaults showPins and showDonePins to true', () => {
    const r = userSettingsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.showPins).toBe(true);
      expect(r.data.showDonePins).toBe(true);
    }
  });

  it('accepts explicit showPins: false', () => {
    const r = userSettingsSchema.safeParse({ showPins: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.showPins).toBe(false);
  });
});
