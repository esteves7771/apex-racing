import { beforeAll, expect, test, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { selectTrack } from '../track/ActiveTrack';
import * as coast from '../track/CoralCoast';
import { vehicleSpawn } from '../vehicle/physicsGeometry';
import { createGroundCollider } from '../track/GroundColliders';
import { getVehicle, type VehicleId } from '../vehicle/VehicleRegistry';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { probeGround } from '../vehicle/GroundContact';
import { writeFileSync, mkdirSync } from 'node:fs';
beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => selectTrack('pine'));
function traverse(id: VehicleId, lane: number, start: number, end: number, speed: number) {
  selectTrack('coast');
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
    road = coast.ribbon(-7.25, 7.25, 0.035),
    terrain = coast.terrainGeometry();
  createGroundCollider(world, road);
  createGroundCollider(world, terrain);
  const spawn = vehicleSpawn(start, lane),
    body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.p.x, spawn.p.y, spawn.p.z)
        .setRotation({ x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) })
        .enabledRotations(false, true, false)
        .setCcdEnabled(true)
        .setAngularDamping(2),
    );
  const car = getVehicle(id);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
      .setContactSkin(0.04)
      .setFriction(0)
      .setRestitution(0.08)
      .setMass(car.mass),
    body,
  );
  for (let i = 0; i < 30; i++) world.step();
  body.setLinvel({ x: -Math.sin(spawn.yaw) * speed, y: 0, z: -Math.cos(spawn.yaw) * speed }, true);
  let air = 0,
    maxAir = 0,
    landed = false,
    wasAir = false,
    maxY = -Infinity,
    minY = Infinity,
    t = start;
  const trace: unknown[] = [];
  for (let tick = 0; tick < 480; tick++) {
    const p = body.translation(),
      v = body.linvel(),
      q = body.rotation(),
      yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
      f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
      near = coast.nearestTrack(p.x, p.z),
      probe = probeGround(world, body, f, right);
    t = near.t;
    const ahead = coast.poseAt(t + (5 + speed * 0.25) / coast.TRACK_LENGTH);
    ahead.p.x += Math.cos(ahead.yaw) * lane;
    ahead.p.z -= Math.sin(ahead.yaw) * lane;
    const error = Math.atan2(
      Math.sin(Math.atan2(-(ahead.p.x - p.x), -(ahead.p.z - p.z)) - yaw),
      Math.cos(Math.atan2(-(ahead.p.x - p.x), -(ahead.p.z - p.z)) - yaw),
    );
    const forward = v.x * f.x + v.z * f.z,
      lateral = v.x * right.x + v.z * right.z;
    applyVehicleCommand(
      body,
      car,
      {
        throttle: forward < speed,
        brake: forward > speed + 1,
        steer: Math.max(-1, Math.min(1, error * 3.6)),
        drift: false,
      },
      false,
      probe.grounded,
      !probe.grounded,
      forward,
      lateral,
      f,
      right,
      v.y,
    );
    if (!probe.grounded) {
      air += 1 / 60;
      wasAir = true;
    } else {
      if (wasAir && air > 0.1) landed = true;
      maxAir = Math.max(maxAir, air);
      air = 0;
    }
    if (lane < 0 && tick % 12 === 0)
      trace.push({ t, lat: near.lateral, y: p.y, vy: v.y, speed: forward, ground: probe.grounded });
    maxY = Math.max(maxY, p.y);
    minY = Math.min(minY, p.y);
    world.step();
    if (t > end) break;
  }
  const result = { id, lane, start, end, speed, t, trace, maxAir, landed, maxY, minY };
  world.free();
  road.dispose();
  terrain.dispose();
  return result;
}
test('every chassis clears Lagoon Leap by ramp collision alone and can use the level bypass', () => {
  const results = [];
  for (const id of ['sprinter', 'vortex', 'bolt'] as const) {
    const leap = traverse(
        id,
        -3.3,
        coast.trackFeatures.jump.crest - 0.012,
        coast.trackFeatures.jump.crest + 0.014,
        25,
      ),
      bypass = traverse(
        id,
        3,
        coast.trackFeatures.jump.crest - 0.012,
        coast.trackFeatures.jump.crest + 0.014,
        22,
      ),
      crest = traverse(id, 0, 0.737, 0.757, 27);
    results.push(leap, bypass, crest);
    for (const speed of [22, 30, 35])
      results.push(
        traverse(
          id,
          -3.3,
          coast.trackFeatures.jump.crest - 0.012,
          coast.trackFeatures.jump.crest + 0.018,
          speed,
        ),
      );
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/coast-jumps.json', JSON.stringify(results, null, 2));
  console.log('COAST JUMPS', JSON.stringify(results));
  for (const r of results) {
    expect(r.t).toBeGreaterThan(r.end);
    expect(r.minY).toBeGreaterThan(3);
    if (r.lane < 0) {
      expect(r.maxAir).toBeGreaterThan(0.15);
      expect(r.landed).toBe(true);
    }
  }
}, 60000);
