import { describe, it, expect } from 'vitest';
import {
  createLocationSchema,
  createEventSchema,
  pointGeometrySchema,
  polygonGeometrySchema,
  lineStringGeometrySchema,
  fieldUseInputSchema,
  photoRefSchema,
  createTaskSchema,
  batchLocationPatchSchema
} from '../../src/lib/schemas';

describe('geometry schemas', () => {
  it('accepts a valid point', () => {
    expect(pointGeometrySchema.safeParse({ type: 'Point', coordinates: [-1, 52] }).success).toBe(
      true
    );
  });
  it('rejects a polygon with too few points', () => {
    const r = polygonGeometrySchema.safeParse({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 0]
        ]
      ]
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid LineString', () => {
    const r = lineStringGeometrySchema.safeParse({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
        [2, 2]
      ]
    });
    expect(r.success).toBe(true);
  });
  it('rejects a LineString with one point', () => {
    const r = lineStringGeometrySchema.safeParse({
      type: 'LineString',
      coordinates: [[0, 0]]
    });
    expect(r.success).toBe(false);
  });
});

describe('createLocationSchema', () => {
  it('accepts a valid field with tags', () => {
    const r = createLocationSchema.safeParse({
      kind: 'field',
      name: 'Top Meadow',
      color: '#60ad6f',
      tags: ['wheat2026', 'ewes'],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-1, 52],
            [-1.001, 52],
            [-1.001, 52.001],
            [-1, 52.001],
            [-1, 52]
          ]
        ]
      }
    });
    expect(r.success).toBe(true);
  });
  it('accepts a valid line', () => {
    const r = createLocationSchema.safeParse({
      kind: 'line',
      name: 'Drain A',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1]
        ]
      }
    });
    expect(r.success).toBe(true);
  });
  it('rejects a field with a point geometry', () => {
    const r = createLocationSchema.safeParse({
      kind: 'field',
      name: 'Oops',
      geometry: { type: 'Point', coordinates: [0, 0] }
    });
    expect(r.success).toBe(false);
  });
  it('rejects a line with a polygon geometry', () => {
    const r = createLocationSchema.safeParse({
      kind: 'line',
      name: 'Mismatched',
      geometry: { type: 'Point', coordinates: [0, 0] }
    });
    expect(r.success).toBe(false);
  });
});

describe('createEventSchema', () => {
  it('accepts photos array', () => {
    const r = createEventSchema.safeParse({
      occurred_at: new Date().toISOString(),
      event_type: 'fertilizer',
      photos: [{ path: '2026/04/abcdef12.jpg', w: 1000, h: 800, size: 12345 }]
    });
    expect(r.success).toBe(true);
  });
});

describe('fieldUseInputSchema', () => {
  it('accepts minimal input', () => {
    const r = fieldUseInputSchema.safeParse({ use_type: 'grazing' });
    expect(r.success).toBe(true);
  });
  it('rejects empty use_type', () => {
    const r = fieldUseInputSchema.safeParse({ use_type: '   ' });
    expect(r.success).toBe(false);
  });
});

describe('photoRefSchema', () => {
  it('accepts a valid YYYY/MM/<uuid>.jpg path', () => {
    const r = photoRefSchema.safeParse({
      path: '2026/04/a1b2c3-d4e5-6789.jpg',
      w: 100,
      h: 100,
      size: 1024
    });
    expect(r.success).toBe(true);
  });
  it('rejects traversal attempts', () => {
    const r = photoRefSchema.safeParse({
      path: '../../etc/passwd',
      w: 100,
      h: 100,
      size: 1024
    });
    expect(r.success).toBe(false);
  });
  it('rejects paths with absolute leading slash', () => {
    const r = photoRefSchema.safeParse({
      path: '/2026/04/a.jpg',
      w: 100,
      h: 100,
      size: 1024
    });
    expect(r.success).toBe(false);
  });
});

describe('createTaskSchema', () => {
  it('requires a title and a due date', () => {
    const r = createTaskSchema.safeParse({
      title: 'Fence repair',
      due_at: new Date().toISOString()
    });
    expect(r.success).toBe(true);
  });
  it('defaults recurrence to none', () => {
    const r = createTaskSchema.safeParse({
      title: 't',
      due_at: new Date().toISOString()
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recurrence).toBe('none');
  });
});

describe('batchLocationPatchSchema', () => {
  it('requires at least one id', () => {
    const r = batchLocationPatchSchema.safeParse({ ids: [] });
    expect(r.success).toBe(false);
  });
  it('accepts use without patch', () => {
    const r = batchLocationPatchSchema.safeParse({
      ids: ['00000000-0000-4000-8000-000000000000'],
      use: { use_type: 'grazing' }
    });
    expect(r.success).toBe(true);
  });
});
