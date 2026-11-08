import { afterEach, beforeAll, expect, test } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import * as coast from '../track/CoralCoast';
import { selectTrack, trackId } from '../track/ActiveTrack';
import { navAt, navigation, routeOffset, projectTrack } from '../ai/TrackNavigation';
import { recordKey, gpRecordKey, readSave, defaults } from '../persistence/storage';
import { runCup } from './CupHarness';
import { vehicleSpawn } from '../vehicle/physicsGeometry';
import { createGroundCollider } from '../track/GroundColliders';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { writeFileSync, mkdirSync } from 'node:fs';
beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => selectTrack('pine'));
test('original closed 3.2–4 km island loop, smooth elevation and two tunnels', () => {
  expect(coast.TRACK_LENGTH).toBeGreaterThan(3200);
  expect(coast.TRACK_LENGTH).toBeLessThan(4000);
  expect(coast.poseAt(0).p.distanceTo(coast.poseAt(1).p)).toBeLessThan(0.001);
  expect(coast.checkpoints).toHaveLength(18);
  expect(coast.tunnels).toHaveLength(2);
  const road = coast.ribbon(-7.25, 7.25, 0.035);
  const p = road.getAttribute('position');
  for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getY(i))).toBe(true);
  expect(coast.isGap(coast.trackFeatures.jump.crest + 0.001, -3)).toBe(true);
  expect(coast.isGap(coast.trackFeatures.jump.crest + 0.001, 3)).toBe(false);
  road.dispose();
});
test('selection rebuilds navigation, bypass and record namespace without losing old data', () => {
  const pineKey = recordKey('time', 'sprinter');
  selectTrack('coast');
  expect(trackId).toBe('coast');
  expect(navigation).toHaveLength(1800);
  const p = navAt(0.35);
  expect(projectTrack(p.x, p.z, 0.349).t).toBeCloseTo(0.35, 3);
  expect(routeOffset(coast.trackFeatures.jump.crest, -1)).toBeCloseTo(3, 1);
  expect(recordKey('time', 'sprinter')).not.toBe(pineKey);
  expect(gpRecordKey('bolt', 'pro')).toContain('coral-coast-rush-1');
  const save = structuredClone(defaults);
  save.settings.track = 'coast';
  save.records[pineKey] = { bestLap: 60, bestTotal: 180 };
  save.records[recordKey('time', 'sprinter')] = { bestLap: 140, bestTotal: 420 };
  const loaded = readSave({ getItem: () => JSON.stringify(save) });
  expect(Object.keys(loaded.records)).toHaveLength(2);
  expect(loaded.settings.track).toBe('coast');
});
test('gates reject backwards, remote and sea-level crossings', () => {
  const c = coast.checkpoints[5],
    a = c.p.clone().addScaledVector(c.tangent, -2),
    b = c.p.clone().addScaledVector(c.tangent, 2);
  expect(coast.crossedGate(a, b, 5)).toBe(true);
  expect(coast.crossedGate(b, a, 5)).toBe(false);
  expect(
    coast.crossedGate(
      a.clone().add(new THREE.Vector3(0, -20, 0)),
      b.clone().add(new THREE.Vector3(0, -20, 0)),
      5,
    ),
  ).toBe(false);
});
test('Coral road internal edges preserve 220 km/h CCD displacement for every chassis', () => {
  selectTrack('coast');
  const road = coast.ribbon(-7.25, 7.25, 0.035),
    terrain = coast.terrainGeometry();
  for (const id of ['sprinter', 'vortex', 'bolt'] as const) {
    const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    createGroundCollider(w, road);
    createGroundCollider(w, terrain);
    const s = vehicleSpawn(-0.015),
      b = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(s.p.x, s.p.y, s.p.z)
          .setCcdEnabled(true)
          .enabledRotations(false, true, false),
      );
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
        .setContactSkin(0.04)
        .setFriction(0)
        .setMass(getVehicle(id).mass),
      b,
    );
    for (let i = 0; i < 60; i++) w.step();
    b.setLinvel({ x: 0, y: 0, z: -61.1 }, true);
    let min = 1;
    for (let i = 0; i < 85; i++) {
      const before = b.translation().z;
      w.step();
      min = Math.min(min, (before - b.translation().z) / (61.1 / 60));
    }
    expect(min).toBeGreaterThan(0.995);
    w.free();
  }
  road.dispose();
  terrain.dispose();
});
test('Coral Coast four physical cars complete a legal Grand Prix', () => {
  selectTrack('coast');
  const result = runCup('club', true, true, 900);
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/coast-native-cup.json', JSON.stringify(result, null, 2));
  console.log('COAST CUP', JSON.stringify({ ...result, traces: undefined }));
  expect(result.completed).toBe(true);
  expect(result.resets).toBe(0);
  for (const racer of result.racers) {
    expect(racer.finish !== null || racer.dnf).toBe(true);
    if (racer.finish !== null) expect(racer.laps).toHaveLength(3);
  }
}, 120000);

test('all three rival vehicles complete the island via bypass without recovery', () => {
  selectTrack('coast');
  const result = runCup('club', false, true, 800);
  writeFileSync('test-results/coast-rivals.json', JSON.stringify(result, null, 2));
  console.log('COAST RIVALS', JSON.stringify({ ...result, traces: undefined }));
  expect(result.resets).toBe(0);
  for (const r of result.racers.slice(1)) {
    expect(r.laps).toHaveLength(3);
    expect(r.finish).not.toBeNull();
  }
}, 120000);

for (const difficulty of ['rookie', 'pro'] as const)
  test(`Coral four-car ${difficulty} completion and fair DNF policy`, () => {
    selectTrack('coast');
    const r = runCup(difficulty, true, true, 1000);
    writeFileSync(`test-results/coast-${difficulty}.json`, JSON.stringify(r, null, 2));
    expect(r.completed).toBe(true);
    expect(r.resets).toBe(0);
    expect(r.racers[0].laps).toHaveLength(3);
    for (const car of r.racers) expect(car.finish !== null || car.dnf).toBe(true);
  }, 120000);
