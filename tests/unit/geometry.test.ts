import { describe, it, expect } from 'vitest';
import { geometryToHectares } from '../../src/lib/utils/geometry';
import type { PolygonGeometry } from '../../src/lib/schemas';

describe('geometryToHectares', () => {
  it('computes roughly 1 ha for a ~100m square', () => {
    // Roughly 100m at 52°N latitude:
    // - 1 degree latitude ≈ 111_320 m, so 100m ≈ 0.000898° lat
    // - 1 degree longitude ≈ 111_320 * cos(52°) ≈ 68_548 m, so 100m ≈ 0.001459° lng
    const lat0 = 52;
    const lng0 = -1;
    const dLat = 100 / 111_320;
    const dLng = 100 / (111_320 * Math.cos((lat0 * Math.PI) / 180));
    const poly: PolygonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [lng0, lat0],
          [lng0 + dLng, lat0],
          [lng0 + dLng, lat0 + dLat],
          [lng0, lat0 + dLat],
          [lng0, lat0]
        ]
      ]
    };
    const ha = geometryToHectares(poly);
    // Expect ~1.0 ha with some slack for projection differences.
    expect(ha).toBeGreaterThan(0.95);
    expect(ha).toBeLessThan(1.05);
  });
});
