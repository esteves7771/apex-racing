import { beforeAll, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync, mkdirSync } from 'node:fs';
import { collisionRun } from './CollisionHarness';
beforeAll(async () => {
  mkdirSync('test-results', { recursive: true });
  await RAPIER.init();
});
it('compares contact margins and slope-tangent drive on the unchanged v0.1.2 circuit', () => {
  const cases = [];
  for (const start of [0.22, 0.42, 0.58, 0.72, 0.85])
    for (const kmh of [90, 120, 150])
      for (const option of [
        { skin: 0.01 },
        { skin: 0.04 },
        { skin: 0.06 },
        { skin: 0.01, surfaceTangent: true },
      ]) {
        const r = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, start, 0.75, {
          ...option,
          initialSpeed: kmh / 3.6,
          throttle: false,
          follow: true,
        });
        cases.push({
          start,
          kmh,
          ...option,
          minRatio: Math.min(...r.motion.map((m) => m.ratio)),
          maxLoss: r.worstLoss,
          maxVerticalStep: Math.max(
            ...r.vertical.slice(1).map((s, i) => Math.abs(s.y - r.vertical[i].y)),
          ),
        });
      }
  writeFileSync('test-results/slope-investigation.json', JSON.stringify(cases, null, 2));
}, 15000);
