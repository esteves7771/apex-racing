import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync, mkdirSync } from 'node:fs';
import { collisionRun } from './CollisionHarness';
import { chassisPhysics } from '../vehicle/physicsGeometry';
beforeAll(async () => {
  mkdirSync('test-results', { recursive: true });
  await RAPIER.init();
});
it('records sustained high-speed motion on existing sections without assuming FPS implies stability', () => {
  const cases = [];
  for (const start of [0.02, 0.22, 0.42, 0.58, 0.72, 0.85])
    for (const kmh of [70, 90, 120, 150]) {
      const r = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, start, 0.75, {
        initialSpeed: kmh / 3.6,
        skin: chassisPhysics.contactSkin,
        throttle: false,
        follow: true,
      });
      cases.push({
        start,
        kmh,
        minMotionRatio: Math.min(...r.motion.map((m) => m.ratio)),
        maxVelocityLoss: r.worstLoss,
        maxVerticalStep: Math.max(
          ...r.vertical.slice(1).map((s, i) => Math.abs(s.y - r.vertical[i].y)),
        ),
        grounded: r.groundedTicks / r.totalTicks,
        maxTrackDistance: r.maxTrackDistance,
        vertical: r.vertical,
        motion: r.motion,
      });
      expect(Number.isFinite(r.position.y)).toBe(true);
      expect(Math.min(...r.motion.map((m) => m.ratio))).toBeGreaterThan(0.99);
    }
  writeFileSync('test-results/evolution-stability.json', JSON.stringify(cases, null, 2));
}, 15000);
it('keeps the evolved non-jump centerline stable on bends, banks and slopes', () => {
  const results = [];
  for (const start of [0.02, 0.22, 0.42, 0.58, 0.72, 0.85])
    for (const kmh of [70, 120, 150]) {
      const r = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, start, 0.75, {
        legacy: false,
        initialSpeed: kmh / 3.6,
        skin: chassisPhysics.contactSkin,
        throttle: false,
        follow: true,
      });
      const minimum = Math.min(...r.motion.map((m) => m.ratio));
      results.push({ start, kmh, minMotionRatio: minimum, maxVelocityLoss: r.worstLoss });
      expect(minimum).toBeGreaterThan(0.97);
    }
  writeFileSync('test-results/evolution-current-stability.json', JSON.stringify(results, null, 2));
}, 15000);
