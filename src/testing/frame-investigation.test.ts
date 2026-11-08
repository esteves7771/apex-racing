import { beforeAll, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync } from 'node:fs';
import { collisionRun } from './CollisionHarness';
beforeAll(async () => {
  await RAPIER.init();
});
it('isolates high-speed displacement loss independently of renderer/camera', () => {
  const results = [];
  for (const surface of ['flat', 'road', 'terrain', 'both'] as const)
    for (const kmh of [40, 70, 75, 77, 80, 85, 90, 120])
      for (const option of [
        { name: 'original' },
        { name: 'ccd-off', ccd: false },
        { name: 'skin-0.01', skin: 0.01 },
        { name: 'skin-0.02', skin: 0.02 },
        { name: 'ccd-4', ccdSubsteps: 4 },
      ]) {
        const r = collisionRun(surface, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, -0.006, 0.5, {
          ...option,
          initialSpeed: kmh / 3.6,
          throttle: false,
        });
        results.push({
          surface,
          kmh,
          option: option.name,
          minimumMotionRatio: Math.min(...r.motion.map((m) => m.ratio)),
          meanMotionRatio: r.motion.reduce((a, m) => a + m.ratio, 0) / r.motion.length,
          worstVelocityLoss: r.worstLoss,
          motion: r.motion,
        });
      }
  writeFileSync('test-results/frame-ccd-investigation.json', JSON.stringify(results, null, 2));
}, 15000);
