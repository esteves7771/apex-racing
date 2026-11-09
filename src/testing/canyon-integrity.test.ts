import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as c from '../track/CanyonCarnival';
it('keeps every physical rail footprint outside all usable roads at the same height', () => {
  let worst = Infinity;
  const bad = [];
  for (const [index, b] of c.barriers.entries()) {
    for (const length of [-0.5, 0, 0.5])
      for (const side of [-0.18, 0.18]) {
        const x = b.p.x + Math.sin(b.yaw) * b.length * length + Math.cos(b.yaw) * side,
          z = b.p.z + Math.cos(b.yaw) * b.length * length - Math.sin(b.yaw) * side;
        for (const route of ['main', ...c.branches.map((b) => b.id)]) {
          const n = c.projectRoute(x, z, undefined, route),
            height = c.routePose(n.t, route, n.lateral).p.y;
          if (Math.abs(b.p.y - height) > 2) continue;
          const clearance = n.distance - c.roadWidthAt(n.t, route) / 2;
          worst = Math.min(worst, clearance);
          if (clearance < -0.03) bad.push({ index, route, t: n.t, clearance });
        }
      }
  }
  mkdirSync('test-results/v08', { recursive: true });
  writeFileSync(
    'test-results/v08/rail-clearance.json',
    JSON.stringify({ worst, intrusions: bad }, null, 2),
  );
  expect(bad.slice(0, 5)).toEqual([]);
});
