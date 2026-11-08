import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync } from 'node:fs';
import { vehicles, getVehicle } from '../vehicle/VehicleRegistry';
import { vehicleConfig, driveStep } from '../vehicle/VehicleConfig';
import { collisionRun } from './CollisionHarness';
import { chassisPhysics } from '../vehicle/physicsGeometry';
import { Race } from '../game/RaceStateMachine';
import { obstacleLayout, obstaclePhysics } from '../game/ObstacleLayout';
import { nearestTrack, checkpoints } from '../track/PineValley';
import { defaults, readSave, recordKey } from '../persistence/storage';
import { makeWedge } from '../vehicle/VehicleBodies';
beforeAll(async () => {
  await RAPIER.init();
});
const input = { throttle: true, brake: false, steer: 0, drift: false };
it('registers three distinct valid profiles and retains exact Sprinter tuning', () => {
  expect(new Set(vehicles.map((v) => v.id)).size).toBe(3);
  expect(getVehicle('bad').id).toBe('sprinter');
  expect(vehicles[0].handling).toBe(vehicleConfig);
  for (const v of vehicles) {
    for (const n of Object.values(v.handling)) expect(n).toBeGreaterThan(0);
    expect(v.handling.grip).toBeGreaterThan(v.handling.driftGrip);
  }
  const g = makeWedge();
  g.computeBoundingBox();
  expect(g.boundingBox!.max.z - g.boundingBox!.min.z).toBeGreaterThan(3.4);
  for (const n of g.getAttribute('position').array) expect(Number.isFinite(n)).toBe(true);
  g.dispose();
});
it('gives meaningful acceleration, braking, grip, drift recovery and capped speed tradeoffs', () => {
  const result = vehicles.map((v) => {
    let speed = 0;
    for (let i = 0; i < 180; i++)
      speed = driveStep(speed, 0, input, false, 1 / 60, v.handling).forward;
    const acceleration = speed;
    for (let i = 0; i < 4000; i++)
      speed = driveStep(speed, 0, input, false, 1 / 60, v.handling).forward;
    expect(speed).toBeCloseTo(v.handling.maxSpeed, 3);
    return {
      acceleration,
      speed,
      brake: driveStep(30, 4, { ...input, throttle: false, brake: true }, false, 0.1, v.handling),
      drift: driveStep(30, 4, { ...input, drift: true }, false, 0.1, v.handling),
    };
  });
  expect(result[2].acceleration).toBeGreaterThan(result[0].acceleration);
  expect(result[1].speed * 3.6).toBeCloseTo(220, 0);
  expect(result[1].brake.forward).toBeGreaterThan(result[0].brake.forward);
  expect(result[2].brake.forward).toBeLessThan(result[0].brake.forward);
  expect(result[1].drift.lateral).toBeGreaterThan(result[2].drift.lateral);
  writeFileSync('test-results/v03-handling.json', JSON.stringify(result, null, 2));
});
it('migrates v0.2 times into Sprinter clean mode, validates selection and retains audio preferences', () => {
  const old = {
    ...structuredClone(defaults),
    bestLap: 70,
    bestTotal: 220,
    settings: { ...defaults.settings, vehicle: 'missing', music: 0.2, master: 0.8 },
  };
  const save = readSave({ getItem: () => JSON.stringify(old) });
  expect(save.settings.vehicle).toBe('sprinter');
  expect(save.settings.music).toBe(0.2);
  expect(save.records[recordKey('time', 'sprinter')].bestTotal).toBe(220);
  expect(save.records[recordKey('challenge', 'sprinter')]).toBeUndefined();
  expect(recordKey('time', 'vortex')).not.toBe(recordKey('time', 'sprinter'));
});
it('places deterministic hazards on the road with a continuous 2.4m center path and safe ramp/spawn', () => {
  expect(obstacleLayout.length).toBe(14);
  expect(new Set(obstacleLayout.map((o) => o.id)).size).toBe(14);
  for (const o of obstacleLayout) {
    expect(nearestTrack(o.p.x, o.p.z).distance).toBeLessThan(5);
    expect(Math.abs(o.lateral) - obstaclePhysics[o.type].half[0]).toBeGreaterThan(1.2);
    expect(o.t).toBeGreaterThan(0.04);
    expect(o.t < 0.55 || o.t > 0.7).toBe(true);
    for (const cp of checkpoints) expect(o.p.distanceTo(cp.p)).toBeGreaterThan(4);
  }
});
it('scores one meaningful hit per obstacle per attempt, rejects touches, resets and completes one valid lap', () => {
  const r = new Race();
  r.start('challenge');
  expect(r.impact('x', 'cone', 10)).toBe(false);
  r.tick(3);
  expect(r.impact('x', 'cone', 0.5)).toBe(false);
  expect(r.impact('x', 'cone', 10)).toBe(true);
  expect(r.impact('x', 'cone', 10)).toBe(false);
  r.impact('y', 'barrel', 10);
  r.impact('z', 'crate', 10);
  r.tick(80);
  for (const i of [1, 2, 3, 4, 5, 6, 7, 0]) r.gate(i);
  expect(r.phase).toBe('RESULTS');
  expect(r.adjustedTime).toBe(89);
  expect(r.hitIds.size).toBe(3);
  r.start('challenge');
  expect(r.penaltyTime).toBe(0);
  expect(r.hitIds.size).toBe(0);
  r.tick(3);
  r.gate(4);
  for (const i of [1, 2, 3, 4, 5, 6, 7, 0]) r.gate(i);
  expect(r.phase).toBe('RACING');
  expect(r.laps.length).toBe(0);
  r.start('time');
  r.tick(3);
  expect(r.impact('x', 'cone', 10)).toBe(false);
});
it('preserves CCD displacement at every vehicle maximum across six current slopes/banks/bends', () => {
  const results = [];
  for (const v of vehicles)
    for (const start of [0.02, 0.22, 0.42, 0.58, 0.72, 0.85]) {
      const r = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, start, 0.75, {
        legacy: false,
        initialSpeed: v.handling.maxSpeed,
        skin: chassisPhysics.contactSkin,
        throttle: false,
        follow: true,
        config: v.handling,
        response: v.response,
        mass: v.mass,
      });
      const ratio = Math.min(...r.motion.map((m) => m.ratio));
      results.push({
        vehicle: v.id,
        start,
        kmh: v.handling.maxSpeed * 3.6,
        ratio,
        loss: r.worstLoss,
      });
      expect(ratio).toBeGreaterThan(0.97);
      expect(Number.isFinite(r.position.y)).toBe(true);
    }
  writeFileSync('test-results/v03-stability.json', JSON.stringify(results, null, 2));
}, 20000);
it('moves all primitive obstacle types on real CCD impacts without launching the upright car', () => {
  const results = [];
  for (const v of vehicles)
    for (const type of ['cone', 'barrel', 'crate'] as const) {
      const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      w.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0));
      const car = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 0.4, 10)
          .enabledRotations(false, true, false)
          .setCcdEnabled(true),
      );
      w.createCollider(
        RAPIER.ColliderDesc.cuboid(...chassisPhysics.halfExtents)
          .setMass(v.mass)
          .setFriction(0)
          .setContactSkin(0.04),
        car,
      );
      const config = obstaclePhysics[type],
        obstacle = w.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, config.half[1] + 0.03, 0)
            .setCcdEnabled(true),
        );
      w.createCollider(
        (type === 'barrel'
          ? RAPIER.ColliderDesc.cylinder(0.65, 0.53)
          : RAPIER.ColliderDesc.cuboid(config.half[0], config.half[1], config.half[2])
        )
          .setMass(config.mass)
          .setFriction(0.5)
          .setRestitution(0.05),
        obstacle,
      );
      car.setLinvel({ x: 0, y: 0, z: -v.handling.maxSpeed }, true);
      let maxY = 0;
      for (let i = 0; i < 60; i++) {
        w.step();
        maxY = Math.max(maxY, car.translation().y);
      }
      const moved = Math.abs(obstacle.translation().z);
      results.push({ vehicle: v.id, type, moved, maxY });
      expect(moved).toBeGreaterThan(0.5);
      expect(maxY).toBeLessThan(1.1);
      expect(car.translation().z).toBeLessThan(2);
      w.free();
    }
  writeFileSync('test-results/v03-impacts.json', JSON.stringify(results, null, 2));
});
it('suppresses resting/recontact spam but permits a separate impact after exit and cooldown', () => {
  const r = new Race();
  r.start('challenge');
  r.tick(3);
  expect(r.impact('cone', 'cone', 8)).toBe(true);
  r.tick(3);
  expect(r.impact('cone', 'cone', 8)).toBe(false);
  r.releaseImpact('cone');
  expect(r.impact('cone', 'cone', 8)).toBe(true);
  expect(r.penaltyTime).toBe(2);
  expect(r.hitIds.size).toBe(1);
  r.releaseImpact('cone');
  expect(r.impact('cone', 'cone', 8)).toBe(false);
  r.start('challenge');
  r.tick(3);
  expect(r.impact('cone', 'cone', 8)).toBe(true);
});
it('expires collision feedback without clearing checkpoint invalidation messages', () => {
  const r = new Race();
  r.start('challenge');
  r.tick(3);
  r.impact('cone', 'cone', 8);
  r.invalidate('Missed checkpoint');
  expect(r.hitMessage).toContain('+1s');
  r.tick(2.6);
  expect(r.hitMessage).toBe('');
  expect(r.message).toBe('Missed checkpoint');
  r.start('challenge');
  expect(r.hitMessage).toBe('');
});
it('keeps each car upright through real barriers, slow technical steering and drift input', () => {
  const results = [];
  for (const v of vehicles) {
    const options = {
      legacy: false,
      skin: 0.04,
      config: v.handling,
      response: v.response,
      mass: v.mass,
    };
    const barrier = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, -0.006, 3, {
      ...options,
      barriers: true,
      initialSpeed: v.handling.maxSpeed,
      steer: 1,
    });
    expect(barrier.worstLoss).toBeGreaterThan(0.8);
    expect(barrier.events.some((e) => JSON.stringify(e.contacts).includes('barrier'))).toBe(true);
    expect(Math.max(...barrier.vertical.map((s) => s.y))).toBeLessThan(1.5);
    const technical = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, 0.12, 2, {
      ...options,
      initialSpeed: 11,
      throttle: false,
      follow: true,
    });
    expect(technical.maxTrackDistance).toBeLessThan(9);
    const drift = collisionRun('both', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, 0.02, 1, {
      ...options,
      initialSpeed: 20,
      drift: true,
      steer: 0.4,
    });
    expect(Number.isFinite(drift.rotation.w)).toBe(true);
    results.push({
      vehicle: v.id,
      barrierLoss: barrier.worstLoss,
      barrierPosition: barrier.position,
      technicalDeviation: technical.maxTrackDistance,
      driftPosition: drift.position,
    });
  }
  writeFileSync('test-results/v03-driving-cases.json', JSON.stringify(results, null, 2));
}, 20000);
