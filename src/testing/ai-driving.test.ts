import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import { RacingAI, rivals } from '../ai/RacingAI';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { chassisPhysics, vehicleSpawn } from '../vehicle/physicsGeometry';
import { probeGround } from '../vehicle/GroundContact';
import { JumpDynamics } from '../vehicle/JumpDynamics';
import { ribbon, terrainGeometry, crossedGate, nearestTrack } from '../track/PineValley';
import { createGroundCollider } from '../track/GroundColliders';
import { barriers } from '../track/TrackMesh';
import { Race } from '../game/RaceStateMachine';
beforeAll(async () => {
  await RAPIER.init();
  mkdirSync('test-results', { recursive: true });
});
it('Stage C: each registered rival physically drives three valid laps with barriers and no reset', () => {
  const evidence = [];
  for (const rival of rivals) {
    const car = getVehicle(rival.vehicle),
      ai = new RacingAI(car, rival, 'club'),
      world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const road = ribbon(-6, 6, 0.035),
      terrain = terrainGeometry();
    createGroundCollider(world, road);
    createGroundCollider(world, terrain);
    for (const b of barriers)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.34, 0.65, b.length / 2)
          .setTranslation(b.p.x, b.p.y + 0.65, b.p.z)
          .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) })
          .setFriction(0.12)
          .setRestitution(0.1),
      );
    const spawn = vehicleSpawn(-0.006),
      body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(spawn.p.x, spawn.p.y, spawn.p.z)
          .setRotation({ x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) })
          .enabledRotations(false, true, false)
          .setAngularDamping(2)
          .setCcdEnabled(true),
      );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(...chassisPhysics.halfExtents)
        .setMass(car.mass)
        .setFriction(0)
        .setRestitution(0.08)
        .setContactSkin(0.04),
      body,
    );
    for (let i = 0; i < 90; i++) world.step();
    ai.reset(0.994);
    const race = new Race();
    race.start('time');
    race.tick(3);
    const previous = spawn.p.clone(),
      jump = new JumpDynamics();
    let maxDistance = 0,
      maxSpeed = 0,
      stuck = false;
    for (let tick = 0; tick < 60 * 430 && race.phase !== 'RESULTS'; tick++) {
      const p = body.translation(),
        v = body.linvel(),
        q = body.rotation(),
        yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().copy(q), 'YXZ').y;
      const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
        right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
        forward = v.x * f.x + v.z * f.z,
        lateral = v.x * right.x + v.z * right.z;
      const probe = probeGround(world, body, f, right),
        near = nearestTrack(p.x, p.z);
      maxDistance = Math.max(maxDistance, near.distance);
      maxSpeed = Math.max(maxSpeed, forward);
      const flight = jump.step({
        t: near.t,
        lateral: near.lateral,
        speed: forward,
        grounded: probe.grounded,
        verticalSpeed: v.y,
        forward: true,
        dt: 1 / 60,
      });
      if (flight.launch !== undefined) v.y = flight.launch;
      const command = ai.update({ x: p.x, z: p.z, yaw, speed: forward, grounded: flight.grounded });
      applyVehicleCommand(
        body,
        car,
        command,
        near.distance > 6.8,
        flight.grounded,
        flight.airborne,
        forward,
        lateral,
        f,
        right,
        v.y,
      );
      world.step();
      race.tick(1 / 60);
      const current = new THREE.Vector3().copy(body.translation());
      for (let i = 0; i < 8; i++) if (crossedGate(previous, current, i)) race.gate(i);
      if (near.distance > 9) race.invalidate('Off track');
      previous.copy(current);
      if (ai.needsReset) {
        stuck = true;
        break;
      }
    }
    const result = {
      rival: rival.id,
      laps: race.laps,
      elapsed: race.elapsed,
      phase: race.phase,
      gate: race.nextGate,
      stuck,
      maxDistance,
      maxSpeed,
      position: body.translation(),
      target: ai.target,
      t: ai.t,
      state: ai.state,
    };
    evidence.push(result);
    console.log('AI DRIVE', JSON.stringify(result));
    world.free();
    road.dispose();
    terrain.dispose();
    writeFileSync('test-results/ai-stage-c.json', JSON.stringify(evidence, null, 2));
    expect(stuck).toBe(false);
    expect(race.laps.length).toBe(3);
    expect(maxDistance).toBeLessThan(8);
  }
}, 120000);
