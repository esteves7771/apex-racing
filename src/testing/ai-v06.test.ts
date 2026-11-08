import { it, expect } from 'vitest';
import { RacingAI, rivals, plannedSpeed } from '../ai/RacingAI';
import { navAt } from '../ai/TrackNavigation';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { selectTrack } from '../track/ActiveTrack';
import { driveStep } from '../vehicle/VehicleConfig';
it('does not turn ordinary low-speed AI braking into reverse, while explicit recovery still uses the shared reverse pedal', () => {
  selectTrack('pine');
  const ai = new RacingAI(getVehicle('vortex'), rivals[1], 'pro'),
    p = navAt(0.2);
  ai.reset(0.2);
  ai.decision = 100;
  ai.speedTarget = 0;
  ai.throttleState = 'brake';
  let speed = 0.7;
  for (let i = 0; i < 60; i++) {
    const cmd = ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed, grounded: true });
    expect(cmd.brake).toBe(false);
    speed = driveStep(speed, 0, cmd, false, 1 / 60, ai.car.handling).forward;
    expect(speed).toBeGreaterThanOrEqual(0);
  }
  ai.stuck = 3;
  expect(ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 0, grounded: true }).brake).toBe(true);
});
it('caps every planner target by the actual vehicle limit and preserves ordered difficulty margins on both circuits', () => {
  for (const track of ['pine', 'coast'] as const) {
    selectTrack(track);
    for (const car of ['sprinter', 'vortex', 'bolt'] as const)
      for (let i = 0; i < 120; i++) {
        const v = getVehicle(car),
          t = i / 120;
        const rookie = plannedSpeed(t, v, 'rookie'),
          club = plannedSpeed(t, v, 'club'),
          pro = plannedSpeed(t, v, 'pro');
        expect(rookie).toBeLessThanOrEqual(club + 0.01);
        expect(club).toBeLessThanOrEqual(pro + 0.01);
        expect(pro).toBeLessThanOrEqual(v.handling.maxSpeed);
        expect(Number.isFinite(pro)).toBe(true);
      }
  }
  selectTrack('pine');
});
it('checks a committed passing corridor far enough ahead to avoid steering into a second blocker', () => {
  const ai = new RacingAI(getVehicle('bolt'), rivals[0], 'pro'),
    p = navAt(0.005);
  ai.reset(0.005);
  ai.passingId = 'lead';
  ai.commit = 3;
  ai.desiredOffset = -2.9;
  ai.offset = -1;
  const lead = navAt(0.02, 0),
    block = navAt(0.025, -2.9);
  ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 20, grounded: true }, [
    { id: 'lead', t: 0.02, lateral: 0, speed: 8, x: lead.x, z: lead.z },
    { id: 'block', t: 0.025, lateral: -2.9, speed: 8, x: block.x, z: block.z },
  ]);
  expect(ai.commit).toBe(0);
  expect(ai.state).toBe('YIELD');
  expect(Math.abs(ai.desiredOffset)).toBeLessThanOrEqual(3.5);
});
it('requests the existing earned-gate recovery after falling beneath the road instead of circulating on the seafloor', () => {
  selectTrack('coast');
  const ai = new RacingAI(getVehicle('bolt'), rivals[0], 'pro'),
    p = navAt(0.78);
  ai.reset(0.78);
  for (let i = 0; i < 65; i++)
    ai.update({ x: p.x, y: -6, z: p.z, yaw: p.yaw, speed: 20, grounded: true });
  expect(ai.needsReset).toBe(true);
  ai.reset(0.7);
  expect(ai.needsReset).toBe(false);
  selectTrack('pine');
});
