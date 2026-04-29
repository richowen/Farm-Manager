import { describe, it, expect } from 'vitest';
import {
  findContainingLocation,
  locationsIntersecting,
  lineLengthMeters,
  geometryToHectares
} from '../../src/lib/utils/geometry';
import type { LocationRecord } from '../../src/lib/schemas';

function field(id: string, coords: [number, number][]): LocationRecord {
  return {
    id,
    kind: 'field',
    name: id,
    color: null,
    notes: null,
    tags: [],
    line_type: null,
    geometry: { type: 'Polygon', coordinates: [coords] },
    area_ha: null,
    length_m: null,
    current_use: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString()
  };
}

describe('findContainingLocation', () => {
  const a = field('a', [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0]
  ]);
  const b = field('b', [
    [2, 2],
    [3, 2],
    [3, 3],
    [2, 3],
    [2, 2]
  ]);

  it('finds the containing polygon', () => {
    const hit = findContainingLocation([a, b], 0.5, 0.5);
    expect(hit?.id).toBe('a');
  });
  it('returns null when outside all polygons', () => {
    const hit = findContainingLocation([a, b], 10, 10);
    expect(hit).toBeNull();
  });
});

describe('locationsIntersecting', () => {
  const a = field('a', [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0]
  ]);
  const b = field('b', [
    [5, 5],
    [6, 5],
    [6, 6],
    [5, 6],
    [5, 5]
  ]);

  it('includes only locations that overlap the selection', () => {
    const box = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-1, -1],
          [2, -1],
          [2, 2],
          [-1, 2],
          [-1, -1]
        ] as [number, number][]
      ]
    };
    expect(locationsIntersecting([a, b], box)).toEqual(['a']);
  });
});

describe('lineLengthMeters', () => {
  it('returns 0 for non-lines', () => {
    expect(lineLengthMeters(null)).toBe(0);
  });
  it('returns a positive length for a line', () => {
    const m = lineLengthMeters({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.001, 0]
      ]
    });
    // ~111 m at the equator
    expect(m).toBeGreaterThan(100);
    expect(m).toBeLessThan(120);
  });
  it('sums the branch lengths of a MultiLineString', () => {
    const single = lineLengthMeters({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.001, 0]
      ]
    });
    const multi = lineLengthMeters({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [0.001, 0]
        ],
        [
          [0.001, 0],
          [0.002, 0]
        ]
      ]
    });
    // The MultiLineString is two branches of the same size => roughly double.
    expect(multi).toBeGreaterThan(single * 1.9);
    expect(multi).toBeLessThan(single * 2.1);
  });
});

describe('geometryToHectares', () => {
  it('returns 0 for non-polygons', () => {
    expect(geometryToHectares({ type: 'Point', coordinates: [0, 0] })).toBe(0);
  });
});
