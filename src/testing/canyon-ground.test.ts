import { it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createGroundCollider } from '../track/GroundColliders';
import { probeGround } from '../vehicle/GroundContact';
import { chassisPhysics } from '../vehicle/physicsGeometry';
it('detects real upright chassis support on a combined Canyon climb and bank without changing legacy probes', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const g = new THREE.PlaneGeometry(40, 100, 1, 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, -pos.getZ(i) * 0.14 + pos.getX(i) * 0.055);
  g.computeVertexNormals();
  createGroundCollider(world, g);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1.2, 0)
      .enabledRotations(false, false, false)
      .enabledTranslations(false, true, false),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(...chassisPhysics.halfExtents)
      .setContactSkin(0.04)
      .setFriction(0)
      .setMass(850),
    body,
  );
  for (let i = 0; i < 180; i++) world.step();
  const f = { x: 0, z: -1 },
    right = { x: 1, z: 0 },
    normal = probeGround(world, body, f, right),
    canyon = probeGround(world, body, f, right, 'canyon');
  expect(Math.abs(body.linvel().y)).toBeLessThan(0.01);
  expect(normal.grounded).toBe(false);
  expect(canyon.grounded).toBe(true);
  expect(canyon.distance).toBeGreaterThan(0.34);
  expect(canyon.distance).toBeLessThan(0.47);
  expect(canyon.normal.y).toBeGreaterThan(0.95);
  world.free();
  g.dispose();
});
