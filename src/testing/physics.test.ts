import { beforeAll, describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { driveStep } from '../vehicle/VehicleConfig';
beforeAll(async () => {
  await RAPIER.init();
});
function worldWithCar() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0).setFriction(0),
  );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0.36, 0)
      .enabledRotations(false, true, false)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7).setMass(850).setFriction(0),
    body,
  );
  return { world, body };
}
describe('Rapier physical integration', () => {
  it('parks on ground and survives a full-speed barrier hit without tunneling', () => {
    const { world, body } = worldWithCar();
    world.createCollider(RAPIER.ColliderDesc.cuboid(8, 1, 0.34).setTranslation(0, 1, -25));
    for (let i = 0; i < 180; i++) world.step();
    expect(Math.abs(body.translation().x)).toBeLessThan(0.01);
    expect(Math.abs(body.translation().z)).toBeLessThan(0.01);
    for (let i = 0; i < 240; i++) {
      const current = body.linvel();
      const next = driveStep(
        -current.z,
        current.x,
        { throttle: true, brake: false, steer: 0, drift: false },
        false,
        1 / 60,
      );
      body.setLinvel({ x: next.lateral, y: current.y, z: -next.forward }, true);
      world.step();
    }
    expect(body.translation().z).toBeGreaterThan(-24);
    expect(body.translation().z).toBeLessThan(-20);
    expect(Number.isFinite(body.translation().y)).toBe(true);
    world.free();
  });
  it('stabilizes pitch and roll on a modest incline and resets a disturbed pose', () => {
    const { world, body } = worldWithCar();
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(15, 0.3, 20)
        .setTranslation(0, 0.2, -15)
        .setRotation({ x: -0.025, y: 0, z: 0, w: Math.sqrt(1 - 0.025 ** 2) }),
    );
    for (let i = 0; i < 180; i++) {
      const v = body.linvel();
      body.setLinvel({ x: 0, y: v.y, z: -8 }, true);
      world.step();
    }
    expect(Number.isFinite(body.translation().y)).toBe(true);
    expect(Math.abs(body.rotation().x)).toBeLessThan(0.001);
    expect(Math.abs(body.rotation().z)).toBeLessThan(0.001);
    body.setTranslation({ x: 0, y: 0.42, z: 0 }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 60; i++) world.step();
    expect(body.translation().y).toBeGreaterThan(0.3);
    expect(body.translation().y).toBeLessThan(1);
    world.free();
  });
});
