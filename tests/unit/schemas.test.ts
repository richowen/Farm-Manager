import { describe, it, expect } from 'vitest';
import {
  createLocationSchema,
  createEventSchema,
  pointGeometrySchema,
  polygonGeometrySchema
} from '../../src/lib/schemas';

describe('geometry schemas', () => {
  it('accepts a valid point', () => {
    const r = pointGeometrySchema.safeParse({ type: 'Point', coordinates: [-1, 52] });
    expect(r.success).toBe(true);
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
});

describe('createLocationSchema', () => {
  it('accepts a valid field', () => {
    const r = createLocationSchema.safeParse({
      kind: 'field',
      name: 'Top Meadow',
      color: '#60ad6f',
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
  it('rejects a field with a point geometry', () => {
    const r = createLocationSchema.safeParse({
      kind: 'field',
      name: 'Oops',
      geometry: { type: 'Point', coordinates: [0, 0] }
    });
    expect(r.success).toBe(false);
  });
  it('rejects missing name', () => {
    const r = createLocationSchema.safeParse({
      kind: 'shed',
      geometry: { type: 'Point', coordinates: [0, 0] }
    });
    expect(r.success).toBe(false);
  });
});

describe('createEventSchema', () => {
  it('requires a known event_type', () => {
    const r = createEventSchema.safeParse({
      occurred_at: new Date().toISOString(),
      event_type: 'definitely_not_a_real_type'
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid event', () => {
    const r = createEventSchema.safeParse({
      occurred_at: new Date().toISOString(),
      event_type: 'fertilizer',
      notes: 'spring split',
      metadata: { product: 'CAN 27', rate_kg_ha: 80 }
    });
    expect(r.success).toBe(true);
  });
});
