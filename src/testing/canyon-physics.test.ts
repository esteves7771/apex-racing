import { beforeAll, afterAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as canyon from '../track/CanyonCarnival';
import { selectTrack } from '../track/ActiveTrack';
import { BoostState } from '../vehicle/BoostState';
import { JumpDynamics } from '../vehicle/JumpDynamics';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { probeGround } from '../vehicle/GroundContact';
import { chassisPhysics } from '../vehicle/physicsGeometry';
import { getVehicle, type VehicleId } from '../vehicle/VehicleRegistry';
import { createGroundCollider } from '../track/GroundColliders';

const dt = 1 / 60;
const jumpEvidence: unknown[] = [];
beforeAll(async () => {
  await RAPIER.init();
  selectTrack('canyon');
  mkdirSync('test-results/v08', { recursive: true });
});
afterAll(() => {
  writeFileSync(
    jumpEvidence.length === canyon.jumps.length * 6
      ? 'test-results/v08/canyon-physics-jumps.json'
      : 'test-results/v08/canyon-physics-jump-subset.json',
    JSON.stringify(jumpEvidence, null, 2),
  );
  selectTrack('pine');
});
function carBody(world: RAPIER.World, id: VehicleId, x: number, y: number, z: number, yaw = 0) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .enabledRotations(false, true, false)
      .setCcdEnabled(true)
      .setAngularDamping(2),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(...chassisPhysics.halfExtents)
      .setMass(getVehicle(id).mass)
      .setFriction(0)
      .setRestitution(0.08)
      .setContactSkin(chassisPhysics.contactSkin),
    body,
  );
  return body;
}
it('activates grounded valid pads once per crossing, caps refresh at 1.8 seconds and expires once', () => {
  const pad = canyon.boostPads[0],
    state = new BoostState();
  expect(state.step(pad.t, pad.lateral, pad.route, false, true)).toBe(0);
  expect(state.remaining).toBe(0);
  expect(state.step(pad.t, pad.lateral, 'wrong-route', true, true)).toBe(0);
  expect(state.step(pad.t, pad.lateral, pad.route, true, false)).toBe(0);
  const first = state.step(pad.t, pad.lateral, pad.route, true, true);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(0.2);
  expect(state.remaining).toBe(1.8);
  for (let i = 0; i < 35; i++) state.step(pad.t, pad.lateral, pad.route, true, true);
  expect(state.serial).toBe(1);
  expect(state.remaining).toBeLessThan(1.3);
  state.step(pad.t - 0.01, pad.lateral, pad.route, true, true);
  state.step(pad.t, pad.lateral, pad.route, true, true);
  expect(state.serial).toBe(2);
  expect(state.remaining).toBe(1.8);
  for (let i = 0; i < 120; i++) state.step(pad.t, pad.lateral, pad.route, true, true);
  expect(state.remaining).toBe(0);
  expect(state.expiredSerial).toBe(1);
  expect(state.serial).toBe(2);
  expect(state.factor).toBeGreaterThan(0);
  for (let i = 0; i < 300; i++) state.step(pad.t + 0.1, 0, 'main', true, true);
  expect(state.factor).toBe(0);
  expect(state.expiredSerial).toBe(1);
});
it('applies identical bounded boost forces to physical player/AI bodies and eases back to ordinary speed', () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0).setFriction(0),
  );
  const id = 'sprinter',
    car = getVehicle(id),
    bodies = [carBody(world, id, -10, 0.42, 0), carBody(world, id, 10, 0.42, 0)],
    states = [new BoostState(), new BoostState()],
    pad = canyon.boostPads[0];
  for (let i = 0; i < 60; i++) world.step();
  for (const b of bodies) b.setLinvel({ x: 0, y: 0, z: -car.handling.maxSpeed }, true);
  let peak = 0,
    maxStep = 0,
    last = car.handling.maxSpeed,
    first = 0;
  const trace: unknown[] = [];
  for (let tick = 0; tick < 1650; tick++) {
    for (let i = 0; i < 2; i++) {
      const b = bodies[i],
        v = b.linvel(),
        f = { x: 0, z: -1 },
        right = { x: 1, z: 0 },
        probe = probeGround(world, b, f, right, 'canyon');
      // A sequence of distinct crossings refreshes, never stacks. The final pad then expires normally.
      const inside = tick < 1080 && tick % 90 !== 89;
      const factor = states[i].step(
        inside ? pad.t : pad.t + 0.01,
        pad.lateral,
        pad.route,
        probe.grounded,
        true,
      );
      const next = applyVehicleCommand(
        b,
        car,
        { throttle: true, brake: false, steer: 0, drift: false },
        false,
        probe.grounded,
        !probe.grounded,
        -v.z,
        v.x,
        f,
        right,
        v.y,
        dt,
        factor,
      );
      expect(next.forward).toBeLessThanOrEqual(car.handling.maxSpeed * 1.2 + 1e-6);
      expect(states[i].remaining).toBeLessThanOrEqual(1.8);
    }
    world.step();
    const speed = -bodies[0].linvel().z;
    if (tick === 0) first = speed;
    maxStep = Math.max(maxStep, Math.abs(speed - last));
    last = speed;
    peak = Math.max(peak, speed);
    expect(bodies[0].linvel().z).toBeCloseTo(bodies[1].linvel().z, 6);
    expect(bodies[0].translation().z).toBeCloseTo(bodies[1].translation().z, 5);
    if (tick % 60 === 0)
      trace.push({ tick, speed, factor: states[0].factor, remaining: states[0].remaining });
  }
  const result = { first, peak, maxStep, finalSpeed: last, base: car.handling.maxSpeed, trace };
  writeFileSync('test-results/v08/canyon-physics-boost.json', JSON.stringify(result, null, 2));
  world.free();
  expect(first - car.handling.maxSpeed).toBeLessThan(car.handling.acceleration * 1.6 * dt + 0.01);
  expect(peak).toBeGreaterThan(car.handling.maxSpeed * 1.19);
  expect(peak).toBeLessThanOrEqual(car.handling.maxSpeed * 1.2 + 0.01);
  expect(maxStep).toBeLessThan(car.handling.braking * dt + 0.08);
  expect(last).toBeCloseTo(car.handling.maxSpeed, 1);
  expect(states[0].expiredSerial).toBe(1);
}, 30000);

function traverse(ramp: (typeof canyon.jumps)[number], bypass: boolean, id: VehicleId = 'bolt') {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  createGroundCollider(world, canyon.roadGeometry);
  const terrain = canyon.terrainGeometry();
  createGroundCollider(world, terrain);
  for (const b of canyon.barriers)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.34, 0.65, b.length / 2)
        .setTranslation(b.p.x, b.p.y + 0.65, b.p.z)
        .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) })
        .setFriction(0.12)
        .setRestitution(0.1),
    );
  const route = bypass && ramp.route === 'cliff' ? 'main' : ramp.route;
  const lane = bypass ? 3 : ramp.lateral,
    start = ramp.t - 40 / canyon.TRACK_LENGTH,
    end = ramp.t + 65 / canyon.TRACK_LENGTH,
    speed = ramp.minSpeed + 4,
    spawn = canyon.routePose(start, route, lane);
  let maxSurface = -Infinity;
  for (const x of [-0.84, 0, 0.84])
    for (const z of [-1.7, 0, 1.7])
      maxSurface = Math.max(
        maxSurface,
        canyon.surfaceAt(
          spawn.p.x + Math.cos(spawn.yaw) * x + Math.sin(spawn.yaw) * z,
          spawn.p.z - Math.sin(spawn.yaw) * x + Math.cos(spawn.yaw) * z,
        ).height,
      );
  const body = carBody(world, id, spawn.p.x, maxSurface + 0.4, spawn.p.z, spawn.yaw),
    car = getVehicle(id),
    jump = new JumpDynamics();
  for (let i = 0; i < 60; i++) world.step();
  body.setLinvel({ x: -Math.sin(spawn.yaw) * speed, y: 0, z: -Math.cos(spawn.yaw) * speed }, true);
  let t = start,
    air = 0,
    maxAir = 0,
    airStart: { x: number; z: number } | undefined,
    maxAirDistance = 0,
    takeoffs = 0,
    impulses = 0,
    landings = 0,
    minClearance = Infinity,
    maxLateral = 0,
    maxY = body.translation().y,
    minY = maxY;
  const trace: unknown[] = [];
  for (let tick = 0; tick < 600; tick++) {
    const p = body.translation(),
      q = body.rotation(),
      v = body.linvel(),
      yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
      f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
      near = canyon.projectRoute(p.x, p.z, t, route),
      probe = probeGround(world, body, f, right, 'canyon'),
      forward = v.x * f.x + v.z * f.z,
      lateral = v.x * right.x + v.z * right.z;
    t = near.t;
    const tangent = canyon.curve.getTangentAt(t),
      flight = jump.step({
        t,
        route: near.route,
        lateral: near.lateral,
        speed: forward,
        grounded: probe.grounded,
        verticalSpeed: v.y,
        forward: f.x * tangent.x + f.z * tangent.z > 0.5,
        dt,
      });
    if (flight.launch !== undefined) {
      v.y = Math.max(v.y, flight.launch);
      body.setLinvel(v, true);
      impulses++;
    }
    if (flight.takeoff) takeoffs++;
    if (flight.landing) landings++;
    const look = canyon.routePose(
        t + (5 + Math.abs(forward) * 0.3) / canyon.TRACK_LENGTH,
        ramp.route,
        lane,
      ),
      error = Math.atan2(
        Math.sin(Math.atan2(-(look.p.x - p.x), -(look.p.z - p.z)) - yaw),
        Math.cos(Math.atan2(-(look.p.x - p.x), -(look.p.z - p.z)) - yaw),
      );
    applyVehicleCommand(
      body,
      car,
      {
        throttle: forward < speed,
        brake: forward > speed + 1,
        steer: Math.max(-1, Math.min(1, error * 3.6)),
        drift: false,
      },
      near.distance > canyon.roadWidthAt(t, route) / 2 + 0.5,
      flight.grounded,
      flight.airborne,
      forward,
      lateral,
      f,
      right,
      v.y,
    );
    if (flight.airborne) {
      if (!airStart) airStart = { x: p.x, z: p.z };
      air += dt;
      maxAirDistance = Math.max(maxAirDistance, Math.hypot(p.x - airStart.x, p.z - airStart.z));
    } else {
      maxAir = Math.max(maxAir, air);
      air = 0;
      airStart = undefined;
    }
    minClearance = Math.min(minClearance, p.y - canyon.routePose(t, route, near.lateral).p.y);
    maxLateral = Math.max(maxLateral, Math.abs(near.lateral));
    maxY = Math.max(maxY, p.y);
    minY = Math.min(minY, p.y);
    if (tick % 12 === 0)
      trace.push({
        tick,
        t,
        lateral: near.lateral,
        speed: forward,
        y: p.y,
        vy: v.y,
        grounded: flight.grounded,
      });
    world.step();
    if (t > end) break;
  }
  const result = {
    ramp: ramp.id,
    route,
    bypass,
    id,
    speed,
    t,
    end,
    takeoffs,
    impulses,
    landings,
    maxAir: Math.max(maxAir, air),
    maxAirDistance,
    minClearance,
    maxLateral,
    maxY,
    minY,
    trace,
  };
  jumpEvidence.push(result);
  world.free();
  terrain.dispose();
  return result;
}
for (const ramp of canyon.jumps)
  for (const id of ['sprinter', 'vortex', 'bolt'] as const)
    it(`${ramp.id}/${id}: physical launch, landing and legitimate ground alternative`, () => {
      const leap = traverse(ramp, false, id),
        bypass = traverse(ramp, true, id);
      for (const r of [leap, bypass]) {
        expect(r.t, JSON.stringify(r)).toBeGreaterThan(r.end);
        expect(r.minClearance, JSON.stringify({ ...r, trace: undefined })).toBeGreaterThan(-0.3);
        expect(r.maxLateral, JSON.stringify({ ...r, trace: undefined })).toBeLessThan(
          canyon.roadWidthAt(ramp.t, r.route) / 2 - 0.3,
        );
      }
      expect(leap.takeoffs).toBeGreaterThan(0);
      expect(leap.landings).toBeGreaterThan(0);
      expect(leap.maxAir).toBeLessThan(2.5);
      expect(leap.maxAirDistance).toBeLessThan(65);
      expect(bypass.impulses).toBe(0);
      expect(bypass.maxAir).toBeLessThan(0.4);
    }, 30000);
