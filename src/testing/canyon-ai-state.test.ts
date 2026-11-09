import { it, expect } from 'vitest';
import { CanyonAI } from '../ai/CanyonAI';
import { rivals } from '../ai/RacingAI';
import { getVehicle } from '../vehicle/VehicleRegistry';
import * as canyon from '../track/CanyonCarnival';
it('requests ordinary bounded pedals and never invents boost capability', () => {
  const car = getVehicle('bolt'),
    ai = new CanyonAI(car, rivals[0], 'pro');
  ai.reset(0.02);
  const pose = canyon.routePose(0.02);
  const command = ai.update({
    x: pose.p.x,
    y: pose.p.y + 0.4,
    z: pose.p.z,
    yaw: pose.yaw,
    speed: 60,
    grounded: true,
  });
  expect(command.brake).toBe(true);
  expect(command.throttle).toBe(false);
  expect(Math.abs(command.steer)).toBeLessThanOrEqual(1);
  expect(ai.speedTarget).toBeLessThanOrEqual(car.handling.maxSpeed);
  ai.update({
    x: pose.p.x,
    y: pose.p.y + 0.4,
    z: pose.p.z,
    yaw: pose.yaw,
    speed: 60,
    grounded: true,
    boostRemaining: 1,
  });
  expect(ai.speedTarget).toBeLessThanOrEqual(car.handling.maxSpeed * 1.2);
});
it('commits a branch before entry and releases it only at the physical merge', () => {
  const ai = new CanyonAI(getVehicle('bolt'), rivals[0], 'pro'),
    branch = canyon.branches[0];
  ai.forcedRoute = branch.id;
  ai.reset(branch.start - 0.009);
  for (let t = branch.start - 0.009; t < branch.end - 0.002; t += 0.0005) {
    const pose = canyon.routePose(t, branch.id);
    ai.update(
      { x: pose.p.x, y: pose.p.y + 0.4, z: pose.p.z, yaw: pose.yaw, speed: 25, grounded: true },
      [],
      0.1,
    );
    expect(ai.route).toBe(branch.id);
  }
  for (let t = branch.end - 0.002; t < branch.end + 0.004; t += 0.0005) {
    const pose = canyon.routePose(t, branch.id);
    ai.update(
      { x: pose.p.x, y: pose.p.y + 0.4, z: pose.p.z, yaw: pose.yaw, speed: 25, grounded: true },
      [],
      0.1,
    );
  }
  expect(ai.route).toBe('main');
  expect(ai.choices.get(branch.id)).toBe(branch.id);
});
it('continues forward past the open finish and requests gradual physical cooldown', () => {
  const ai = new CanyonAI(getVehicle('bolt'), rivals[0], 'pro');
  ai.reset(1.001);
  const p = canyon.routePose(1.001);
  const command = ai.update({
    x: p.p.x,
    y: p.p.y + 0.4,
    z: p.p.z,
    yaw: p.yaw,
    speed: 35,
    grounded: true,
    finished: true,
  });
  const dx = ai.target.x - p.p.x,
    dz = ai.target.z - p.p.z;
  expect(-dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)).toBeGreaterThan(0);
  expect(command.brake).toBe(true);
  expect(ai.speedTarget).toBe(13);
  for (let i = 0; i < 70; i++)
    ai.update(
      {
        x: p.p.x,
        y: p.p.y + 0.4,
        z: p.p.z,
        yaw: p.yaw,
        speed: 0.1,
        grounded: true,
        finished: true,
      },
      [],
      0.1,
    );
  expect(ai.speedTarget).toBe(0);
  expect(ai.command.brake).toBe(false);
  expect(ai.needsReset).toBe(false);
});

it('clears an already leading pass at a junction instead of yielding to the following car', () => {
  const ai = new CanyonAI(getVehicle('sprinter'), rivals[2], 'pro');
  ai.reset(0.13);
  // A committed passing corridor with a five-metre lead, immediately before a fork.
  Object.assign(ai, { passingId: 'player', passLane: -3, commit: 3 });
  const pose = canyon.routePose(0.13, 'main', -3),
    following = canyon.routePose(0.129);
  ai.update(
    { x: pose.p.x, y: pose.p.y + 0.4, z: pose.p.z, yaw: pose.yaw, speed: 12, grounded: true },
    [
      {
        id: 'player',
        t: 0.129,
        lateral: 0,
        speed: 11,
        x: following.p.x,
        z: following.p.z,
        route: 'main',
      },
    ],
  );
  expect(ai.state).toBe('CLEAR_PASS');
  expect(ai.speedTarget).toBeGreaterThan(10);
  expect(ai.desiredOffset).toBe(-3);
});

it('physically follows the moving racing-line reference through linked curves without wall-hugging', async () => {
  const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
  await RAPIER.init();
  const { runCanyon } = await import('./CanyonHarness');
  const r = runCanyon('bolt', 'rookie', 'main', 110);
  expect(r.offroad).toBeLessThan(0.05);
  expect(r.recoveries).toBe(0);
  expect(r.nextGate).toBeGreaterThanOrEqual(5);
  expect(r.t).toBeGreaterThan(0.65);
}, 30000);
