import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { wheelAngularSpeed } from '../vehicle/wheelAnimation';
describe('APEX-01 wheel motion', () => {
  it('rolls in the direction that cancels translation at the tire contact patch in both directions', () => {
    for (const speed of [-9, 0, 15, 42]) {
      const rotation = new Vector3(wheelAngularSpeed(speed, 0, 0), 0, 0),
        contactVelocity = rotation.cross(new Vector3(0, -0.38, 0)).add(new Vector3(0, 0, -speed));
      expect(contactVelocity.length()).toBeLessThan(1e-10);
    }
  });
  it('spins the outside wheel faster in a left turn and integrates equivalently at different refresh rates', () => {
    expect(Math.abs(wheelAngularSpeed(20, 1, 0.94))).toBeGreaterThan(
      Math.abs(wheelAngularSpeed(20, 1, -0.94)),
    );
    const simulate = (hz: number) => {
      let angle = 0;
      for (let i = 0; i < hz; i++) angle += wheelAngularSpeed(20, 0.5, 0.94) / hz;
      return angle;
    };
    expect(simulate(60)).toBeCloseTo(simulate(165), 10);
  });
});
