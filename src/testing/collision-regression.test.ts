import { beforeAll, describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { collisionRun } from './CollisionHarness';
import { GROUND_TRIMESH_FLAGS, createGroundCollider } from '../track/GroundColliders';
import { poseAt, ribbon, terrainGeometry, samples, terrainHeight } from '../track/PineValley';
import { barriers } from '../track/TrackMesh';
import { vehicleSpawn, chassisPhysics } from '../vehicle/physicsGeometry';
beforeAll(async () => {
  await RAPIER.init();
});
describe('v0.1.1 real Pine Valley surface regressions', () => {
  it('spawns and resets clear of the actual road and terrain triangle meshes at every checkpoint', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
      road = ribbon(-6, 6, 0.035),
      terrain = terrainGeometry();
    const surfaces = [createGroundCollider(world, road), createGroundCollider(world, terrain)];
    for (const t of [-0.006, ...Array.from({ length: 8 }, (_, i) => i / 8 + 0.0015)]) {
      const spawn = vehicleSpawn(t),
        rotation = new RAPIER.Quaternion(0, Math.sin(spawn.yaw / 2), 0, Math.cos(spawn.yaw / 2));
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(spawn.p.x, spawn.p.y, spawn.p.z)
          .setRotation(rotation)
          .enabledRotations(false, true, false),
      );
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(...chassisPhysics.halfExtents)
          .setMass(chassisPhysics.mass)
          .setFriction(0),
        body,
      );
      for (const surface of surfaces) {
        const contact = c.contactCollider(surface, 1);
        expect(contact?.distance ?? Infinity, `checkpoint ${t}`).toBeGreaterThan(0.04);
        for (const x of [-0.84, 0, 0.84])
          for (const z of [-1.7, 0, 1.7]) {
            const wx = spawn.p.x + Math.cos(spawn.yaw) * x + Math.sin(spawn.yaw) * z;
            const wz = spawn.p.z - Math.sin(spawn.yaw) * x + Math.cos(spawn.yaw) * z;
            const toi = surface.castRay(
              new RAPIER.Ray({ x: wx, y: spawn.p.y + 1, z: wz }, { x: 0, y: -1, z: 0 }),
              3,
              true,
            );
            expect(toi).toBeGreaterThan(1 + chassisPhysics.halfExtents[1] + 0.04);
            expect(toi).toBeLessThan(3);
          }
      }
      for (let i = 0; i < 60; i++) {
        const v = body.linvel();
        body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
        world.step();
      }
      expect(Math.abs(body.translation().y - spawn.p.y)).toBeLessThan(0.15);
      expect(Number.isFinite(body.linvel().y)).toBe(true);
      world.removeRigidBody(body);
    }
    world.free();
    road.dispose();
    terrain.dispose();
  });
  it('reproduces the old ghost impact and eliminates it without changing acceleration or chassis', () => {
    const old = collisionRun('both', 0),
      fixed = collisionRun('both'),
      flat = collisionRun('flat');
    expect(old.worstLoss).toBeGreaterThan(15);
    expect(
      old.events.some((e) =>
        e.contacts.some((c) => {
          const n = c as { normal: { y: number }; impulses: number[] };
          return Math.abs(n.normal.y) < 0.1 && n.impulses.some((i) => i > 5000);
        }),
      ),
    ).toBe(true);
    expect(fixed.worstLoss).toBeLessThan(0.1);
    expect(fixed.events).toEqual([]);
    expect(fixed.finalSpeed).toBeGreaterThan(28);
    expect(Math.abs(fixed.finalSpeed - flat.finalSpeed)).toBeLessThan(0.1);
    expect(fixed.groundedTicks).toBe(fixed.totalTicks);
  });
  it.each(['road', 'terrain'] as const)(
    'also repairs %s independently, rather than hiding the duplicate surface',
    (surface) => {
      const r = collisionRun(surface);
      expect(r.worstLoss).toBeLessThan(0.1);
      expect(r.groundedTicks).toBe(r.totalTicks);
    },
  );
  it('crosses road triangle joins on a gentle bend and elevated descent without abnormal impacts', () => {
    for (const start of [0.02, 0.35, 0.56, 0.7]) {
      const r = collisionRun('both', GROUND_TRIMESH_FLAGS, start, 4, { follow: true });
      expect(r.worstLoss).toBeLessThan(0.8);
      expect(r.events).toEqual([]);
      expect(r.groundedTicks / r.totalTicks).toBeGreaterThan(0.95);
      expect(r.maxTrackDistance).toBeLessThan(5);
    }
  });
  it('brakes from moderate speed without a solver impact', () => {
    const r = collisionRun('both', GROUND_TRIMESH_FLAGS, -0.006, 4, { brakeAfter: 2 });
    expect(r.speedSamples[119]).toBeGreaterThan(20);
    expect(r.finalSpeed).toBeLessThan(1);
    expect(r.events).toEqual([]);
  });
  it('keeps steering and handbrake drift finite and recoverable', () => {
    const r = collisionRun('both', GROUND_TRIMESH_FLAGS, 0.025, 3, { follow: true, drift: true });
    expect(r.events).toEqual([]);
    expect(r.groundedTicks / r.totalTicks).toBeGreaterThan(0.95);
    expect(r.maxTrackDistance).toBeLessThan(6);
    expect(Math.abs(r.rotation.x) + Math.abs(r.rotation.z)).toBeLessThan(0.001);
  });
  it.each([-4.5, 4.5])(
    'does not invent impacts while passing near the barrier at offset %s',
    (offset) => {
      const r = collisionRun('both', GROUND_TRIMESH_FLAGS, -0.006, 2, { offset, barriers: true });
      expect(r.events).toEqual([]);
      expect(r.finalSpeed).toBeGreaterThan(20);
    },
  );
  it('still physically stops the vehicle against a circuit barrier', () => {
    const r = collisionRun('both', GROUND_TRIMESH_FLAGS, -0.006, 5, { steer: -1, barriers: true });
    expect(r.maxTrackDistance).toBeLessThan(7.4);
    expect(r.finalSpeed).toBeLessThan(2);
    expect(
      r.events.some((e) =>
        e.contacts.some((c) => (c as { surface: string }).surface === 'barrier'),
      ),
    ).toBe(true);
  });
  it('has a closed shared seam, safe spawn clearance and no barrier intrusion into asphalt', () => {
    const g = ribbon(-6, 6, 0.035),
      positions = g.getAttribute('position');
    const row = positions.count / (samples.length + 1);
    for (let i = 0; i < row; i++) {
      expect(positions.getX(i)).toBe(positions.getX(positions.count - row + i));
      expect(positions.getY(i)).toBe(positions.getY(positions.count - row + i));
      expect(positions.getZ(i)).toBe(positions.getZ(positions.count - row + i));
    }
    for (const t of [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8]) {
      const spawn = vehicleSpawn(t),
        p = spawn.p;
      const highestUnderChassis = Math.max(
        ...[-0.84, 0, 0.84].flatMap((x) =>
          [-1.7, 0, 1.7].map(
            (z) =>
              terrainHeight(
                p.x + Math.cos(spawn.yaw) * x + Math.sin(spawn.yaw) * z,
                p.z - Math.sin(spawn.yaw) * x + Math.cos(spawn.yaw) * z,
              ) + 0.035,
          ),
        ),
      );
      expect(p.y - chassisPhysics.halfExtents[1] - highestUnderChassis).toBeGreaterThan(0.059);
    }
    for (const b of barriers) {
      const near = samples.reduce(
        (best, s) => Math.min(best, s.p.distanceTo(b.p.clone().setY(0))),
        Infinity,
      );
      expect(near - 0.34).toBeGreaterThan(6);
    }
    g.dispose();
    const terrain = terrainGeometry();
    expect(terrain.getAttribute('position').count).toBeGreaterThan(1000);
    terrain.dispose();
  });
});
