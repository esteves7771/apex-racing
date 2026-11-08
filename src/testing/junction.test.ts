import { it, expect } from 'vitest';
import * as c from '../track/CoralCoast';
import { coastBarriers } from '../track/CoastWorld';
import { coastEdgePoint } from '../track/CoastEdges';
it('removes the inward causeway offset loop from rails and physical barrier chords', () => {
  for (let i = 1620; i < 1710; i++)
    for (const side of [-1, 1]) {
      const p = coastEdgePoint(i / c.SEGMENTS, side * 7.6);
      expect(c.nearestTrack(p.x, p.z).distance).toBeGreaterThan(7.3);
    }
  for (const b of coastBarriers) {
    const t = c.nearestTrack(b.p.x, b.p.z).t;
    if (t < 0.9 || t > 0.95) continue;
    for (const u of [-0.45, 0, 0.45]) {
      const x = b.p.x + Math.sin(b.yaw) * b.length * u,
        z = b.p.z + Math.cos(b.yaw) * b.length * u;
      expect(c.nearestTrack(x, z).distance).toBeGreaterThan(7);
    }
  }
});
it('leaves Lagoon jump/bypass and all unrelated offset edges unchanged', () => {
  for (const t of [0.2, 0.51875, 0.52375, 0.53575, 0.7, 0.98])
    for (const w of [-7.6, 7.6]) {
      const s = c.samples[Math.round(t * c.SEGMENTS) % c.SEGMENTS],
        a = s.p.clone().addScaledVector(s.side, w),
        b = coastEdgePoint(s.t, w);
      expect(a.distanceTo(b)).toBeLessThan(1e-6);
    }
});
