import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Race, formatTime } from '../game/RaceStateMachine';
import {
  curve,
  samples,
  ROAD_WIDTH,
  checkpoints,
  crossedGate,
  nearestTrack,
  poseAt,
  TRACK_LENGTH,
  ribbon,
} from '../track/PineValley';
import { readSave, writeSave, defaults } from '../persistence/storage';
import { driveStep, vehicleConfig } from '../vehicle/VehicleConfig';
import { controls } from '../input/keyboard';
describe('race contract', () => {
  it('locks countdown, counts fixed time, freezes pause and resumes countdown', () => {
    const r = new Race();
    r.start('time');
    r.tick(1);
    expect(r.elapsed).toBe(0);
    r.pause();
    r.tick(10);
    expect(r.countdown).toBe(2);
    r.resume();
    r.tick(2);
    expect(r.phase).toBe('RACING');
    r.tick(1 / 60);
    expect(r.elapsed).toBe(1 / 60);
    r.pause();
    r.tick(100);
    expect(r.elapsed).toBe(1 / 60);
  });
  it('requires eight gates in order and three valid laps for results', () => {
    const r = new Race();
    r.start('time');
    r.tick(3);
    for (let lap = 0; lap < 3; lap++) {
      for (const i of [1, 2, 3, 4, 5, 6, 7, 0]) {
        r.tick(10);
        r.gate(i);
      }
    }
    expect(r.phase).toBe('FINISHING');
    r.tick(4);
    expect(r.phase).toBe('RESULTS');
    expect(r.laps).toEqual([80, 80, 80]);
    expect(r.elapsed).toBe(240);
  });
  it('rejects shortcuts and restarts a discarded lap without granting a result', () => {
    const r = new Race();
    r.start('time');
    r.tick(3);
    r.gate(4);
    expect(r.invalid).toBe(true);
    for (const i of [1, 2, 3, 4, 5, 6, 7, 0]) r.gate(i);
    expect(r.laps).toHaveLength(0);
    expect(r.invalid).toBe(false);
    expect(r.nextGate).toBe(1);
  });
  it('free drive has no countdown, clock, or finish but remembers safe reset gates', () => {
    const r = new Race();
    r.start('free');
    r.tick(99);
    r.gate(1);
    expect(r.phase).toBe('RACING');
    expect(r.elapsed).toBe(0);
    expect(r.nextGate).toBe(2);
    expect(r.safeGate).toBe(1);
    expect(r.laps).toEqual([]);
  });
  it('formats exact milliseconds and minutes', () => {
    expect(formatTime(65.123)).toBe('1:05.123');
    expect(formatTime(0)).toBe('0:00.000');
    expect(formatTime(null)).toBe('—:——.———');
  });
});
describe('circuit geometry and crossing', () => {
  it('faces every road normal upward', () => {
    const geometry = ribbon(-6, 6, 0.035);
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeGreaterThan(0.7);
    geometry.dispose();
  });
  it('is closed, smooth and suitably long', () => {
    expect(curve.getPointAt(0).distanceTo(curve.getPointAt(1))).toBeLessThan(0.001);
    expect(TRACK_LENGTH).toBeGreaterThan(1000);
    expect(TRACK_LENGTH).toBeLessThan(2200);
    for (let i = 0; i < samples.length; i++)
      expect(samples[i].p.distanceTo(samples[(i + 1) % samples.length].p)).toBeLessThan(4);
  });
  it('has no nonadjacent centerline or road-width overlaps', () => {
    for (let i = 0; i < samples.length; i += 3)
      for (let j = i + 15; j < samples.length; j += 3) {
        if (samples.length - j + i < 15) continue;
        expect(samples[i].p.distanceTo(samples[j].p)).toBeGreaterThan(ROAD_WIDTH + 2);
      }
  });
  it('places horizontal perpendicular frames and spawn on road', () => {
    for (const s of samples) expect(Math.abs(s.tangent.dot(s.side))).toBeLessThan(0.00001);
    expect(nearestTrack(poseAt(0).p.x, poseAt(0).p.z).distance).toBeLessThan(0.01);
  });
  it('requires forward plane crossing inside gate width', () => {
    checkpoints.forEach((cp, i) => {
      const before = cp.p.clone().addScaledVector(cp.tangent, -2),
        after = cp.p.clone().addScaledVector(cp.tangent, 2);
      expect(crossedGate(before, after, i)).toBe(true);
      expect(crossedGate(after, before, i)).toBe(false);
      const offset = new THREE.Vector3(-cp.tangent.z, 0, cp.tangent.x).multiplyScalar(20);
      expect(crossedGate(before.add(offset), after.add(offset), i)).toBe(false);
    });
  });
});
describe('handling', () => {
  const neutral = { throttle: false, brake: false, steer: 0, drift: false };
  it('stays parked, supports reverse and caps speed', () => {
    expect(driveStep(0, 0, neutral, false, 1 / 60).forward).toBe(0);
    let f = 0;
    for (let i = 0; i < 6000; i++)
      f = driveStep(f, 0, { ...neutral, throttle: true }, false, 1 / 60).forward;
    expect(f).toBeLessThanOrEqual(vehicleConfig.maxSpeed);
    expect(f).toBeGreaterThan(40);
    expect(driveStep(0, 0, { ...neutral, brake: true }, false, 1 / 60).forward).toBeLessThan(0);
  });
  it('brakes harder than coasting and drifts with reduced lateral grip', () => {
    expect(driveStep(20, 0, { ...neutral, brake: true }, false, 1 / 60).forward).toBeLessThan(
      driveStep(20, 0, neutral, false, 1 / 60).forward,
    );
    expect(driveStep(20, 8, { ...neutral, drift: true }, false, 1 / 60).lateral).toBeGreaterThan(
      driveStep(20, 8, neutral, false, 1 / 60).lateral,
    );
  });
  it('turns left correctly and reverses steering when reversing', () => {
    expect(driveStep(20, 0, { ...neutral, steer: 1 }, false, 1 / 60).yaw).toBeGreaterThan(0);
    expect(driveStep(-5, 0, { ...neutral, steer: 1 }, false, 1 / 60).yaw).toBeLessThan(0);
  });
  it('has the same fixed-step outcome at 30 and 60 render FPS', () => {
    const simulate = (fps: number) => {
      let f = 0;
      for (let frame = 0; frame < fps * 5; frame++)
        for (let tick = 0; tick < 60 / fps; tick++)
          f = driveStep(f, 0, { ...neutral, throttle: true }, false, 1 / 60).forward;
      return f;
    };
    expect(simulate(30)).toBe(simulate(60));
  });
  it('maps keyboard and arrows consistently', () => {
    expect(controls(new Set(['KeyW', 'KeyA', 'Space']))).toEqual({
      throttle: true,
      brake: false,
      steer: 1,
      drift: true,
    });
    expect(controls(new Set(['ArrowDown', 'ArrowRight'])).steer).toBe(-1);
  });
});
describe('persistence', () => {
  it('handles corrupt, missing and blocked storage', () => {
    for (const text of ['null', '{bad', '{"version":2}'])
      expect(readSave({ getItem: () => text })).toEqual(defaults);
    expect(readSave(undefined)).toEqual(defaults);
    expect(writeSave(defaults, undefined)).toBe(false);
    expect(
      writeSave(defaults, {
        setItem: () => {
          throw Error('blocked');
        },
      }),
    ).toBe(false);
  });
  it('validates option values and round-trips records', () => {
    let stored = '';
    writeSave(
      { ...defaults, bestLap: 66.4, bestTotal: 200 },
      {
        setItem: (_, s) => {
          stored = s;
        },
      },
    );
    expect(readSave({ getItem: () => stored }).bestLap).toBe(66.4);
    expect(
      readSave({
        getItem: () =>
          JSON.stringify({ version: 1, settings: { master: 9, color: 'wrong' }, bestLap: -1 }),
      }).settings.master,
    ).toBe(1);
  });
});
