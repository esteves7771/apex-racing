import { beforeAll, describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { RingBuffer, frameStatistics } from '../render/frameDiagnostics';
import { FRAME_ORDER } from '../render/frameOrder';
import { cameraBlend } from '../camera/smoothing';
import { collisionRun } from './CollisionHarness';
import { chassisPhysics } from '../vehicle/physicsGeometry';
beforeAll(async () => {
  await RAPIER.init();
});
describe('v0.1.2 pacing, interpolation and motion', () => {
  it('keeps diagnostic buffers bounded and chronological without allocating a new slot', () => {
    const ring = new RingBuffer(3, () => ({ n: 0 }));
    const first = ring.next();
    first.n = 1;
    ring.next().n = 2;
    ring.next().n = 3;
    const reused = ring.next();
    expect(reused).toBe(first);
    reused.n = 4;
    expect(ring.values().map((s) => s.n)).toEqual([2, 3, 4]);
    expect(ring.latest()?.n).toBe(4);
    ring.clear();
    expect(ring.values()).toEqual([]);
  });
  it('calculates frame percentiles and FPS from actual frame durations', () => {
    expect(frameStatistics([10, 10, 10, 10, 60])).toEqual({
      fps: 50,
      average: 20,
      p95: 60,
      p99: 60,
    });
    expect(frameStatistics([]).fps).toBe(0);
  });
  it('orders physics/interpolation, vehicle pose, camera and light before automatic render', () => {
    expect(FRAME_ORDER.physics).toBeLessThan(FRAME_ORDER.vehiclePose);
    expect(FRAME_ORDER.vehiclePose).toBeLessThan(FRAME_ORDER.camera);
    expect(FRAME_ORDER.camera).toBeLessThan(FRAME_ORDER.lighting);
    expect(FRAME_ORDER.lighting).toBeLessThan(0);
  });
  it.each([false, true])(
    'damps the camera equivalently at 30, 60 and 165 Hz (reduced motion %s)',
    (reduced) => {
      const result = (hz: number) => {
        let position = 0;
        for (let i = 0; i < hz; i++) position += (10 - position) * cameraBlend(1 / hz, reduced);
        return position;
      };
      expect(result(30)).toBeCloseTo(result(60), 10);
      expect(result(165)).toBeCloseTo(result(60), 10);
    },
  );
  it.each([40, 70, 90, 120])(
    'preserves position advance consistent with velocity at %s km/h with CCD enabled',
    (kmh) => {
      const result = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, -0.006, 0.5, {
        skin: chassisPhysics.contactSkin,
        initialSpeed: kmh / 3.6,
        throttle: false,
      });
      expect(result.motion.every((m) => m.ratio > 0.995 && m.ratio < 1.005)).toBe(true);
      expect(result.worstLoss).toBeLessThan(0.01);
    },
  );
  it('detects the old high-speed CCD clamp even though velocity-loss checks pass', () => {
    const result = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, -0.006, 0.5, {
      skin: 0,
      initialSpeed: 120 / 3.6,
      throttle: false,
    });
    expect(result.worstLoss).toBeLessThan(0.01);
    expect(Math.min(...result.motion.map((m) => m.ratio))).toBeLessThan(0.2);
  });
  it('retains real high-speed barrier stopping and safe reset clearance with contact skin', () => {
    const result = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, -0.006, 5, {
      skin: chassisPhysics.contactSkin,
      initialSpeed: 120 / 3.6,
      steer: -1,
      barriers: true,
    });
    expect(result.maxTrackDistance).toBeLessThan(7.4);
    expect(
      result.events.some((e) =>
        e.contacts.some((c) => (c as { surface: string }).surface === 'barrier'),
      ),
    ).toBe(true);
    expect(chassisPhysics.spawnClearance).toBeGreaterThan(chassisPhysics.contactSkin);
  });
});
