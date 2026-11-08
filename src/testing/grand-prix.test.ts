import { it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync } from 'node:fs';
import {
  navigation,
  navAt,
  projectTrack,
  routeOffset,
  signedDistance,
} from '../ai/TrackNavigation';
import { RacingAI, rivals, plannedSpeed, cornerSpeed, difficulties } from '../ai/RacingAI';
import { GrandPrixDirector, RacerProgress, gridSpawn } from '../game/GrandPrix';
import { Race } from '../game/RaceStateMachine';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { readSave, writeSave, defaults, gpRecordKey, recordKey } from '../persistence/storage';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { vehicleSpawn } from '../vehicle/physicsGeometry';
import { TRACK_LENGTH, checkpoints, surfaceAt } from '../track/PineValley';
import { createVehicleTelemetry } from '../game/store';
beforeAll(async () => {
  await RAPIER.init();
});
it('starts each actor with independent animation state after player jumps and braking', () => {
  const player = createVehicleTelemetry(),
    rival = createVehicleTelemetry();
  player.airborne = true;
  player.landingSerial = 4;
  player.braking = true;
  player.speed = 30;
  expect(rival.airborne).toBe(false);
  expect(rival.landingSerial).toBe(0);
  expect(rival.braking).toBe(false);
  expect(rival.speed).toBe(0);
});
it('treats an oncoming vehicle as an obstruction rather than matching its forward speed', () => {
  const p = navAt(0.005),
    car = getVehicle('bolt'),
    lead = navAt(0.02),
    blockers = [-2.9, 2.9].map((l, i) => ({
      id: 'block' + i,
      t: 0.008,
      lateral: l,
      speed: 8,
      x: navAt(0.008, l).x,
      z: navAt(0.008, l).z,
    }));
  const run = (yaw: number) => {
    const ai = new RacingAI(car, rivals[0], 'pro');
    ai.reset(0.005);
    ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 20, grounded: true }, [
      { id: 'lead', t: 0.02, lateral: 0, speed: 8, x: lead.x, z: lead.z, yaw },
      ...blockers,
    ]);
    return ai.speedTarget;
  };
  expect(run(lead.yaw + Math.PI)).toBeLessThan(run(lead.yaw));
});
it('samples the existing closed track with bounded curvature, elevation, braking zones and safe routes', () => {
  expect(navigation.length).toBe(720);
  expect(
    navigation.every((n) =>
      [n.x, n.y, n.z, n.curvature, n.recommendedSpeed].every(Number.isFinite),
    ),
  ).toBe(true);
  expect(navigation.some((n) => n.brakingZone)).toBe(true);
  expect(navigation.some((n) => n.y > 3)).toBe(true);
  expect(Math.hypot(navAt(0).x - navAt(1).x, navAt(0).z - navAt(1).z)).toBeLessThan(0.001);
  for (let i = 0; i < 720; i++) {
    const t = i / 720,
      offset = routeOffset(t, 0);
    expect(Math.abs(offset)).toBeLessThanOrEqual(3.5);
    if (t > 0.585 && t < 0.64) expect(offset).toBeGreaterThan(2.7);
  }
});
it('projects locally across finish and does not jump to a remote section after an ambiguous/off-road displacement', () => {
  const a = navAt(0.9995),
    b = navAt(0.0005),
    first = projectTrack(a.x, a.z, 0.999),
    next = projectTrack(b.x, b.z, first.t);
  expect(signedDistance(first.t, next.t)).toBeGreaterThan(0);
  expect(signedDistance(first.t, next.t)).toBeLessThan(3);
  const remote = navAt(0.45),
    p = projectTrack(remote.x, remote.z, 0.05);
  expect(Math.abs(signedDistance(0.05, p.t))).toBeLessThan(TRACK_LENGTH * 0.04);
  for (const n of navigation.filter((_, i) => i % 17 === 0)) {
    const p = projectTrack(n.x, n.z, n.t);
    expect(Math.abs(signedDistance(n.t, p.t))).toBeLessThan(0.1);
  }
});
it('plans braking ahead of corners according to vehicle/difficulty limits', () => {
  const v = getVehicle('vortex'),
    b = getVehicle('bolt');
  let anticipation = false;
  for (let t = 0; t < 1; t += 0.003) {
    if (plannedSpeed(t, v, 'club') < cornerSpeed(t, v, 'club') - 2) anticipation = true;
    expect(plannedSpeed(t, v, 'rookie')).toBeLessThanOrEqual(plannedSpeed(t, v, 'pro') + 0.01);
  }
  expect(anticipation).toBe(true);
  expect(v.handling.braking).toBeLessThan(b.handling.braking);
  expect(difficulties.rookie.reaction).toBeGreaterThan(difficulties.pro.reaction);
});
it('follows when both passing lanes are occupied, and commits to a clear overtaking lane', () => {
  const at = navAt(0.005),
    car = getVehicle('bolt'),
    r = rivals[0],
    ai = new RacingAI(car, r, 'pro', 104);
  ai.reset(0.005);
  const lead = { id: 'lead', t: 0.02, lateral: 0, speed: 8, x: navAt(0.02).x, z: navAt(0.02).z };
  const blockers = [-2.9, 2.9].map((l, i) => ({
    id: 'block' + i,
    t: 0.008,
    lateral: l,
    speed: 8,
    x: navAt(0.008, l).x,
    z: navAt(0.008, l).z,
  }));
  ai.update({ x: at.x, z: at.z, yaw: at.yaw, speed: 20, grounded: true }, [lead, ...blockers]);
  expect(ai.state).toBe('FOLLOW');
  expect(ai.commit).toBe(0);
  const clear = new RacingAI(car, r, 'pro', 104);
  clear.reset(0.005);
  clear.update({ x: at.x, z: at.z, yaw: at.yaw, speed: 20, grounded: true }, [lead]);
  expect(clear.state).toBe('OVERTAKE');
  expect(clear.commit).toBeGreaterThan(2);
  const side = Math.sign(clear.desiredOffset);
  for (let i = 0; i < 60; i++)
    clear.update({ x: at.x, z: at.z, yaw: at.yaw, speed: 20, grounded: true }, [lead]);
  expect(Math.sign(clear.desiredOffset)).toBe(side);
});
it('aborts an occupied pass and forbids passing through the ramp/bypass approach', () => {
  const car = getVehicle('bolt'),
    ai = new RacingAI(car, rivals[0], 'pro'),
    at = navAt(0.005);
  ai.reset(0.005);
  ai.commit = 2;
  ai.desiredOffset = -2.9;
  ai.update({ x: at.x, z: at.z, yaw: at.yaw, speed: 16, grounded: true }, [
    { id: 'blocked', t: 0.006, lateral: -2.9, speed: 9, x: at.x - 3, z: at.z },
  ]);
  expect(ai.commit).toBe(0);
  ai.reset(0.58);
  const jump = navAt(0.58, 3);
  ai.update({ x: jump.x, z: jump.z, yaw: jump.yaw, speed: 20, grounded: true }, [
    { id: 'lead', t: 0.59, lateral: 3, speed: 8, x: navAt(0.59, 3).x, z: navAt(0.59, 3).z },
  ]);
  expect(ai.state).toBe('BYPASS');
  expect(ai.commit).toBe(0);
});
it('is deterministic for a fixed seed and uses fixed-step steering independent of render scheduling', () => {
  const run = () => {
    const ai = new RacingAI(getVehicle('sprinter'), rivals[2], 'club', 12),
      p = navAt(0.05);
    ai.reset(0.05);
    let sum = 0;
    for (let i = 0; i < 120; i++)
      sum += ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 18, grounded: true }).steer;
    return { sum, offset: ai.offset, seed: ai.seed };
  };
  expect(run()).toEqual(run());
});
it('keeps the countdown synchronized, freezes pause, and resumes finishing without fabricating times', () => {
  const r = new Race();
  r.start('gp');
  r.tick(2);
  expect(r.elapsed).toBe(0);
  r.pause();
  r.tick(10);
  expect(r.countdown).toBe(1);
  r.resume();
  r.tick(1);
  expect(r.phase).toBe('RACING');
  r.tick(1);
  expect(r.elapsed).toBe(1);
  r.beginFinish();
  r.pause();
  r.tick(10);
  r.resume();
  expect(r.phase).toBe('FINISHING');
  r.tick(1);
  expect(r.elapsed).toBe(1);
  expect(r.simulationTime).toBe(2);
});
it('requires ordered checkpoints and three valid laps; finish crossing alone and reverse travel do not score', () => {
  const r = new RacerProgress('x');
  r.gate(0, 1);
  expect(r.laps.length).toBe(0);
  r.gate(4, 2);
  expect(r.invalid).toBe(true);
  for (const i of [1, 2, 3, 4, 5, 6, 7, 0]) r.gate(i, 10);
  expect(r.laps.length).toBe(0);
  for (let lap = 0; lap < 3; lap++)
    for (const i of [1, 2, 3, 4, 5, 6, 7, 0]) r.gate(i, 20 + lap * 20);
  expect(r.finishTime).toBe(60);
  expect(r.laps.length).toBe(3);
  const reverse = new RacerProgress('reverse'),
    cp = checkpoints[1];
  reverse.resetPosition(cp.p.clone().addScaledVector(cp.tangent, 2), cp.t + 0.002);
  reverse.update(cp.p.clone().addScaledVector(cp.tangent, -2), 10);
  expect(reverse.nextGate).toBe(1);
});
it('ranks valid progress with stable close ties and official finish times before unfinished cars', () => {
  const gp = new GrandPrixDirector();
  gp.start('sprinter', 'club');
  gp.racers.forEach((r, i) => (r.progress.score = 100 - i * 10));
  expect(gp.standings[0].id).toBe('player');
  gp.racers[1].progress.score = 110;
  expect(gp.standings[0].id).toBe('rex');
  gp.racers[2].progress.finishTime = 200;
  expect(gp.standings[0].id).toBe('nova');
  gp.history = [{ time: 0, order: ['rex', 'player', 'nova', 'milo'] }];
  gp.racers[0].progress.score = 100;
  gp.racers[1].progress.score = 100.1;
  expect(gp.standings.filter((r) => r.progress.finishTime === null)[0].id).toBe('rex');
});
it('marks unfinished rivals DNF only after the bounded post-player window, leaving finish times null', () => {
  const gp = new GrandPrixDirector();
  gp.start('bolt', 'club');
  gp.player.progress.finishTime = 100;
  gp.update(100);
  expect(gp.completed).toBe(false);
  gp.update(119);
  expect(gp.racers[1].progress.dnf).toBe(false);
  gp.update(120);
  expect(gp.completed).toBe(true);
  for (const r of gp.racers.slice(1)) {
    expect(r.progress.dnf).toBe(true);
    expect(r.progress.finishTime).toBeNull();
  }
});
it('isolates and validates GP records without changing old records, archives, or sound settings', () => {
  const save = structuredClone(defaults),
    key = gpRecordKey('bolt', 'pro');
  save.bestTotal = 210;
  save.archives['pine-valley-v1'] = { bestTotal: 240, bestLap: 80 };
  save.settings.music = 0;
  save.gpRecords[key] = {
    bestPosition: 2,
    bestTime: 205,
    bestLap: 65,
    podiums: 1,
    cups: 0,
    history: [{ position: 2, time: 205, bestLap: 65 }],
  };
  let json = '';
  writeSave(save, { setItem: (_, v) => (json = v) });
  const read = readSave({ getItem: () => json });
  expect(read.bestTotal).toBe(210);
  expect(read.archives['pine-valley-v1'].bestTotal).toBe(240);
  expect(read.settings.music).toBe(0);
  expect(read.gpRecords[key].bestPosition).toBe(2);
  expect(key).not.toBe(recordKey('time', 'bolt'));
  expect(key).not.toBe(gpRecordKey('bolt', 'rookie'));
  const corrupt = JSON.parse(json);
  corrupt.gpRecords[key].bestPosition = 9;
  expect(readSave({ getItem: () => JSON.stringify(corrupt) }).gpRecords[key]).toBeUndefined();
});
it('places the four-car grid without overlap and above every rotated footprint', () => {
  const all = Array.from({ length: 4 }, (_, i) => gridSpawn(i));
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) expect(all[i].p.distanceTo(all[j].p)).toBeGreaterThan(4);
    for (const x of [-0.84, 0.84])
      for (const z of [-1.7, 1.7]) {
        const s = all[i],
          wx = s.p.x + Math.cos(s.yaw) * x + Math.sin(s.yaw) * z,
          wz = s.p.z - Math.sin(s.yaw) * x + Math.cos(s.yaw) * z;
        expect(s.p.y - 0.34 - surfaceAt(wx, wz).height).toBeGreaterThan(0.04);
      }
  }
});
it('recovers behind an earned checkpoint without granting laps and waits when all reset lanes are occupied', () => {
  const gp = new GrandPrixDirector();
  gp.start('sprinter', 'club');
  const w = new RAPIER.World({ x: 0, y: 0, z: 0 }),
    r = gp.racers[1];
  r.body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
  r.progress.safeGate = 2;
  r.progress.nextGate = 3;
  r.progress.laps = [60];
  gp.racers
    .filter((o) => o !== r)
    .forEach((o) => {
      o.x = 1000;
      o.z = 1000;
    });
  expect(gp.resetRacer(r.id)).toBe(true);
  expect(r.progress.laps).toEqual([60]);
  expect(r.progress.nextGate).toBe(3);
  expect(r.progress.invalid).toBe(true);
  expect(r.progress.t).toBeLessThan(checkpoints[2].t);
  [0, 2.8, -2.8].forEach((lane, i) => {
    const p = vehicleSpawn(checkpoints[2].t - 0.004, lane),
      o = gp.racers.filter((o) => o !== r)[i];
    o.x = p.p.x;
    o.z = p.p.z;
  });
  expect(gp.resetRacer(r.id)).toBe(false);
  w.free();
});
it('survives head-on, rear-end, side-by-side and angled CCD car impacts with upright stable bodies', () => {
  const cases = [
    { name: 'head-on', a: [0, 8, 0, 42], b: [0, -8, Math.PI, 40] },
    { name: 'rear-end', a: [0, 8, 0, 42], b: [0, 0, 0, 12] },
    { name: 'side', a: [-2, 0, -0.12, 30], b: [0, 0, 0, 28] },
    { name: 'angled', a: [-5, 8, -0.45, 61.1], b: [0, 0, 0, 18] },
  ];
  const evidence = [];
  for (const c of cases) {
    const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    w.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0));
    const bodies = [c.a, c.b].map(([x, z, yaw, speed], i) => {
      const b = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, 0.42, z)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
          .enabledRotations(false, true, false)
          .setCcdEnabled(true)
          .setAngularDamping(2),
      );
      w.createCollider(
        RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
          .setMass(i ? 780 : 1000)
          .setContactSkin(0.04)
          .setFriction(0)
          .setRestitution(0.08),
        b,
      );
      b.setLinvel({ x: -Math.sin(yaw) * speed, y: 0, z: -Math.cos(yaw) * speed }, true);
      return b;
    });
    let contacts = 0,
      maxY = 0;
    for (let tick = 0; tick < 180; tick++) {
      for (const b of bodies) {
        const v = b.linvel(),
          q = b.rotation(),
          yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
          f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
          right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        applyVehicleCommand(
          b,
          getVehicle('sprinter'),
          { throttle: false, brake: false, steer: 0, drift: false },
          false,
          true,
          false,
          v.x * f.x + v.z * f.z,
          v.x * right.x + v.z * right.z,
          f,
          right,
          v.y,
        );
      }
      w.step();
      w.contactPair(bodies[0].collider(0), bodies[1].collider(0), (m) => {
        if (m.numContacts()) contacts++;
      });
      maxY = Math.max(maxY, ...bodies.map((b) => b.translation().y));
    }
    expect(contacts).toBeGreaterThan(0);
    expect(maxY).toBeLessThan(0.9);
    for (const b of bodies) {
      expect(Number.isFinite(b.translation().x)).toBe(true);
      expect(Math.abs(b.angvel().y)).toBeLessThan(0.2);
      expect(Math.abs(b.rotation().x) + Math.abs(b.rotation().z)).toBeLessThan(0.001);
    }
    evidence.push({ name: c.name, contacts, maxY, positions: bodies.map((b) => b.translation()) });
    w.free();
  }
  writeFileSync('test-results/gp-collision-cases.json', JSON.stringify(evidence, null, 2));
});
