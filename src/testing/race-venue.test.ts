import { afterEach, expect, test } from 'vitest';
import * as THREE from 'three';
import * as coast from '../track/CoralCoast';
import {
  finishPaint,
  gridPaint,
  raceLightSignal,
  PAINT_CLEARANCE,
} from '../track/RaceVenueGeometry';
import { gridSpawn } from '../game/GrandPrix';
import { selectTrack } from '../track/ActiveTrack';
import { Race } from '../game/RaceStateMachine';
afterEach(() => selectTrack('pine'));
test('finish paint spans the road, centres on the unmodified trigger, and follows surface height', () => {
  const g = finishPaint(coast),
    p = g.getAttribute('position'),
    cp = coast.checkpoints[0];
  let min = Infinity,
    max = -Infinity,
    lateralMin = Infinity,
    lateralMax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      s = (x - cp.p.x) * cp.tangent.x + (z - cp.p.z) * cp.tangent.z,
      l = (x - cp.p.x) * -cp.tangent.z + (z - cp.p.z) * cp.tangent.x;
    min = Math.min(min, s);
    max = Math.max(max, s);
    lateralMin = Math.min(lateralMin, l);
    lateralMax = Math.max(lateralMax, l);
    expect(p.getY(i)).toBeCloseTo(coast.surfaceAt(x, z).height + PAINT_CLEARANCE, 5);
  }
  expect(min + max).toBeCloseTo(0, 4);
  expect(max - min).toBeCloseTo(2, 4);
  expect(lateralMax - lateralMin).toBeCloseTo(coast.ROAD_WIDTH, 4);
  const a = cp.p.clone().addScaledVector(cp.tangent, -2),
    b = cp.p.clone().addScaledVector(cp.tangent, 2);
  expect(coast.crossedGate(a, b, 0)).toBe(true);
  expect(coast.crossedGate(b, a, 0)).toBe(false);
  g.dispose();
});
test('all four grid outlines are built around exact physical GP spawns', () => {
  selectTrack('coast');
  const spawns = Array.from({ length: 4 }, (_, i) => gridSpawn(i)),
    g = gridPaint(coast, spawns),
    p = g.getAttribute('position');
  for (let slot = 0; slot < 4; slot++) {
    const spawn = spawns[slot],
      coords = [];
    for (let i = slot * 12; i < (slot + 1) * 12; i++) {
      const v = new THREE.Vector3(p.getX(i) - spawn.p.x, 0, p.getZ(i) - spawn.p.z).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -spawn.yaw,
      );
      coords.push(v);
      expect(p.getY(i)).toBeCloseTo(
        coast.surfaceAt(p.getX(i), p.getZ(i)).height + PAINT_CLEARANCE,
        5,
      );
    }
    expect(Math.min(...coords.map((v) => v.x))).toBeCloseTo(-1.3, 4);
    expect(Math.max(...coords.map((v) => v.x))).toBeCloseTo(1.3, 4);
    expect(Math.max(...coords.map((v) => v.z))).toBeCloseTo(2.35, 4);
  }
  expect(spawns[0].p.distanceTo(spawns[1].p)).toBeGreaterThan(4);
  expect(spawns[0].p.distanceTo(spawns[2].p)).toBeGreaterThan(10);
  g.dispose();
});
test('gantry follows official countdown, freezes on pause, resets, and has bounded GO/results states', () => {
  const r = new Race();
  r.start('gp');
  const signal = () => raceLightSignal(r.phase, r.countdown, r.elapsed, r.mode, r.previousPhase);
  expect(signal()).toBe('red-1');
  r.tick(1);
  expect(signal()).toBe('red-2');
  r.pause();
  r.tick(20);
  expect(signal()).toBe('red-2');
  r.resume();
  r.tick(1);
  expect(signal()).toBe('red-3');
  r.tick(1);
  expect(signal()).toBe('go');
  r.tick(3);
  expect(signal()).toBe('off');
  r.phase = 'RESULTS';
  expect(signal()).toBe('finish');
  r.start('gp');
  expect(signal()).toBe('red-1');
  expect(raceLightSignal('MENU', 3, 0, 'gp')).toBe('off');
  expect(raceLightSignal('RACING', 0, 0, 'free')).toBe('off');
});
test('reset/exploration invalidation is expected; clean ordered laps still count', () => {
  selectTrack('coast');
  const r = new Race();
  r.start('time');
  r.tick(3);
  r.invalidate('Reset · lap invalid');
  for (let i = 1; i <= 18; i++) r.gate(i % 18);
  expect(r.laps).toHaveLength(0);
  expect(r.message).toBe('Lap discarded · try again');
  expect(r.invalid).toBe(false);
  for (let i = 1; i <= 18; i++) {
    r.tick(1);
    r.gate(i % 18);
  }
  expect(r.laps).toHaveLength(1);
  expect(r.message).toBe('Clean lap');
});
