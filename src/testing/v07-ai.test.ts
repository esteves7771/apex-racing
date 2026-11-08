import { it, expect } from 'vitest';
import { RacingAI, rivals } from '../ai/RacingAI';
import { racingLineAt } from '../ai/RacingLine';
import { navAt, projectTrack } from '../ai/TrackNavigation';
import { selectTrack, TRACK_LENGTH } from '../track/ActiveTrack';
import { getVehicle } from '../vehicle/VehicleRegistry';
it('holds a passing corridor until longitudinal clearance even after the original timer expires', () => {
  selectTrack('pine');
  const ai = new RacingAI(getVehicle('bolt'), rivals[0], 'pro'),
    p = navAt(0.005, -3.1),
    lead = navAt(0.007);
  ai.reset(0.005);
  ai.offset = -3.1;
  ai.desiredOffset = -3.1;
  ai.commit = 0.001;
  ai.passingId = 'lead';
  ai.state = 'OVERTAKE';
  ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 8, grounded: true }, [
    { id: 'lead', t: 0.007, lateral: 0, speed: 5, x: lead.x, z: lead.z },
  ]);
  expect(ai.commit).toBeGreaterThan(0);
  expect(ai.desiredOffset).toBe(-3.1);
});
it('does not delay the nominal racing trajectory with the traffic lane-change rate limit', () => {
  selectTrack('pine');
  let t = 0.01;
  for (let i = 0; i < 500; i++) {
    const candidate = i / 1000;
    if (
      Math.abs(
        racingLineAt(candidate, 'pro').offset - racingLineAt(candidate + 0.003, 'pro').offset,
      ) > 0.2
    ) {
      t = candidate;
      break;
    }
  }
  const ai = new RacingAI(getVehicle('bolt'), rivals[0], 'pro');
  ai.reset(t);
  ai.state = 'FOLLOW_LINE';
  ai.decision = 100;
  ai.speedTarget = 30;
  ai.offset = racingLineAt(t, 'pro').offset;
  ai.desiredOffset = ai.offset;
  const p = navAt(t + 0.003, racingLineAt(t + 0.003, 'pro').offset);
  ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 25, grounded: true });
  expect(ai.offset).toBeCloseTo(racingLineAt(ai.t!, 'pro').offset, 3);
});
it('rebuilds bounded continuous racing lines when switching circuits without mutating handling', () => {
  const config = JSON.stringify(getVehicle('bolt').handling);
  for (const track of ['pine', 'coast', 'pine'] as const) {
    selectTrack(track);
    for (let i = 0; i < 400; i++) {
      const p = racingLineAt(i / 400, 'pro');
      expect(Number.isFinite(p.curvature)).toBe(true);
      expect(Math.abs(p.offset)).toBeLessThanOrEqual(3.001);
      expect(Math.abs(p.offset - racingLineAt((i + 1) / 400, 'pro').offset)).toBeLessThan(2);
    }
  }
  expect(JSON.stringify(getVehicle('bolt').handling)).toBe(config);
  selectTrack('pine');
});
it('keeps a committed pass on its own corridor across a nominal racing-line crossover', () => {
  const ai = new RacingAI(getVehicle('bolt'), rivals[0], 'pro'),
    p = navAt(0.98, 3);
  ai.reset(0.98);
  ai.decision = 100;
  ai.commit = 3;
  ai.passingId = 'lead';
  ai.offset = -3.1;
  ai.desiredOffset = -3.1;
  ai.speedTarget = 25;
  ai.update({ x: p.x, z: p.z, yaw: p.yaw, speed: 10, grounded: true });
  expect(projectTrack(ai.target.x, ai.target.z, 0.98).lateral).toBeCloseTo(-3.1, 1);
});
it('backs out of a stalled pass physically only when the rear corridor is clear', () => {
  const make = () => {
    const ai = new RacingAI(getVehicle('bolt'), rivals[0], 'pro');
    ai.reset(0.02);
    ai.decision = 100;
    ai.commit = 3;
    ai.passingId = 'lead';
    ai.speedTarget = 0;
    ai.queueTime = 1.3;
    return ai;
  };
  const p = navAt(0.02),
    input = { x: p.x, z: p.z, yaw: p.yaw, speed: 0, grounded: true },
    rear = navAt(0.02 - 5 / TRACK_LENGTH);
  const blocked = make();
  blocked.update(input, [
    { id: 'behind', t: 0.02 - 5 / TRACK_LENGTH, lateral: 0, speed: 0, x: rear.x, z: rear.z },
  ]);
  expect(blocked.backOut).toBe(0);
  expect(blocked.command.brake).toBe(false);
  const clear = make();
  clear.update(input);
  expect(clear.state).toBe('BACK_OUT');
  expect(clear.command.brake).toBe(true);
  expect(clear.needsReset).toBe(false);
});
