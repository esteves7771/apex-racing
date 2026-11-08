import { it, expect, vi } from 'vitest';
import { installKeyboard, keys, drivingInput } from '../input/keyboard';
import { race } from '../game/store';
import { Race } from '../game/RaceStateMachine';
import { selectTrack, tracks } from '../track/ActiveTrack';
import { spectatorPockets, personGeometry } from '../render/WorldLife';
import { finishCommand } from '../game/FinishDrive';
import { speedFov } from '../camera/speedFeedback';
import { driveStep } from '../vehicle/VehicleConfig';
it('freezes official scoring at crossing, pauses cooldown and resets cleanly', () => {
  const r = new Race();
  r.start('challenge');
  r.tick(3);
  r.elapsed = 94;
  r.penaltyTime = 3;
  r.laps = [30, 31, 33];
  expect(r.beginFinish()).toBe(true);
  r.gate(1);
  r.impact('x', 'crate', 20);
  r.tick(1);
  expect(r.elapsed).toBe(94);
  expect(r.adjustedTime).toBe(97);
  expect(r.laps).toHaveLength(3);
  expect(r.penaltyTime).toBe(3);
  r.pause();
  r.tick(10);
  expect(r.finishElapsed).toBe(1);
  r.resume();
  r.tick(3);
  expect(r.phase).toBe('RESULTS');
  expect(r.beginFinish(100)).toBe(false);
  r.start('time');
  expect(r.finishTime).toBe(null);
  expect(r.finishElapsed).toBe(0);
});
it('keeps the GP clock advancing after skip while preserving the official player result', () => {
  const r = new Race();
  r.start('gp');
  r.tick(3);
  r.elapsed = 90;
  r.gp.player.progress.finishTime = 90;
  r.beginFinish(90);
  r.tick(1);
  r.skipFinish();
  r.tick(2);
  expect(r.elapsed).toBe(90);
  expect(r.simulationTime).toBe(93);
  expect(r.gp.player.progress.finishTime).toBe(90);
});
it('places recognizable finite people outside both racing surfaces', () => {
  for (const id of ['pine', 'coast'] as const) {
    const road = tracks[id];
    for (const p of spectatorPockets(id)) {
      expect(road.nearestTrack(p.p.x, p.p.z).distance).toBeGreaterThan(10);
      expect(Number.isFinite(p.p.y)).toBe(true);
    }
  }
  for (let i = 0; i < 3; i++) {
    const g = personGeometry(i);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeGreaterThan(1.8);
    expect(g.boundingBox!.min.y).toBeGreaterThan(0);
    g.dispose();
  }
});
it('uses normal braking and bounded steering without reverse or instant stopping', () => {
  for (const id of ['pine', 'coast'] as const) {
    selectTrack(id);
    const p = tracks[id].poseAt(0.002);
    const c = finishCommand(p.p.x, p.p.z, p.yaw, 45, 0);
    expect(c.brake).toBe(true);
    expect(Math.abs(c.steer)).toBeLessThanOrEqual(1);
    const next = driveStep(45, 0, c, false, 1 / 60);
    expect(next.forward).toBeGreaterThan(40);
    const slow = finishCommand(p.p.x, p.p.z, p.yaw, 0, 3);
    expect(slow.brake).toBe(false);
    expect(slow.throttle).toBe(true);
  }
  selectTrack('pine');
});

it('adds a bounded continuous speed lens only to non-reduced chase view', () => {
  expect(speedFov(0, false, false, 0)).toBe(0);
  expect(speedFov(48, false, false, 0)).toBe(10);
  expect(speedFov(100, false, false, 0)).toBe(10);
  expect(speedFov(48, true, false, 0)).toBe(0);
  expect(speedFov(48, false, true, 0)).toBe(0);
  expect(speedFov(48, false, false, 1)).toBe(0);
  expect(speedFov(30, false, false, 0)).toBeGreaterThan(0);
  expect(speedFov(30, false, false, 0)).toBeLessThan(10);
});

it('advances the short cooldown clock behind skipped solo results', () => {
  const r = new Race();
  r.start('time');
  r.tick(3);
  r.elapsed = 90;
  r.beginFinish();
  r.skipFinish();
  expect(r.cooldownActive).toBe(true);
  r.tick(4);
  expect(r.cooldownActive).toBe(false);
  expect(r.finishElapsed).toBe(4);
  r.tick(2);
  expect(r.finishElapsed).toBe(4);
  expect(r.elapsed).toBe(90);
});

it('buffers held throttle during countdown while ignoring new menu driving input', () => {
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('HTMLElement', class {});
  const dispose = installKeyboard();
  const key = (type: string) =>
    events.dispatchEvent(Object.assign(new Event(type), { code: 'KeyW', repeat: false }));
  try {
    race.start('time');
    key('keydown');
    expect(race.phase).toBe('COUNTDOWN');
    expect(drivingInput().throttle).toBe(true);
    race.tick(3);
    expect(race.phase).toBe('RACING');
    expect(drivingInput().throttle).toBe(true);
    key('keyup');
    expect(drivingInput().throttle).toBe(false);
    race.phase = 'MENU';
    key('keydown');
    expect(drivingInput().throttle).toBe(false);
  } finally {
    dispose();
    keys.clear();
    race.phase = 'MENU';
    vi.unstubAllGlobals();
  }
});
