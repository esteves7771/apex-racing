import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  curve,
  poseAt,
  nearestTrack,
  ribbon,
  terrainGeometry,
  surfaceAt,
  trackFeatures,
} from '../track/PineValley';
import { createGroundCollider } from '../track/GroundColliders';
import { chassisPhysics, vehicleSpawn } from '../vehicle/physicsGeometry';
import { JumpDynamics } from '../vehicle/JumpDynamics';
import { probeGround } from '../vehicle/GroundContact';
import { driveStep } from '../vehicle/VehicleConfig';
import { vehicles } from '../vehicle/VehicleRegistry';
beforeAll(async () => {
  mkdirSync('test-results', { recursive: true });
  await RAPIER.init();
});
it('validates every vehicle on physical ramp and bypass at 22m/s and maximum speed', () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const road = ribbon(-6, 6, 0.035),
    terrain = terrainGeometry();
  createGroundCollider(world, road);
  createGroundCollider(world, terrain);
  const results = [];
  for (const vehicle of vehicles)
    for (const speed of [22, vehicle.handling.maxSpeed])
      for (const lane of [trackFeatures.jump.laneCenter, 3]) {
        const t = trackFeatures.jump.approach - 0.012,
          spawn = vehicleSpawn(t),
          d = curve.getTangentAt(t),
          side = new THREE.Vector3(-d.z, 0, d.x);
        spawn.p.addScaledVector(side, lane);
        spawn.p.y = surfaceAt(spawn.p.x, spawn.p.z).height + 0.45;
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(spawn.p.x, spawn.p.y, spawn.p.z)
            .setRotation({ x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) })
            .enabledRotations(false, true, false)
            .setAngularDamping(2)
            .setCcdEnabled(true),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(...chassisPhysics.halfExtents)
            .setMass(vehicle.mass)
            .setFriction(0)
            .setContactSkin(chassisPhysics.contactSkin),
          body,
        );
        for (let tick = 0; tick < 45; tick++) world.step();
        body.setLinvel({ x: d.x * speed, y: 0, z: d.z * speed }, true);
        const jump = new JumpDynamics();
        let launches = 0,
          landings = 0,
          maxGap = 0,
          airTicks = 0,
          minForward = Infinity;
        for (let tick = 0; tick < 360; tick++) {
          const p = body.translation(),
            q = body.rotation(),
            yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().copy(q), 'YXZ').y,
            f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
            right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
            near = nearestTrack(p.x, p.z),
            v = body.linvel(),
            forward = v.x * f.x + v.z * f.z,
            lateral = v.x * right.x + v.z * right.z,
            probe = probeGround(world, body, f, right);
          const flight = jump.step({
            t: near.t,
            lateral: near.lateral,
            speed: forward,
            grounded: probe.grounded,
            verticalSpeed: v.y,
            forward: f.dot(curve.getTangentAt(near.t)) > 0.5,
            dt: 1 / 60,
          });
          if (flight.launch !== undefined) {
            launches++;
            v.y = flight.launch;
            body.setLinvel(v, true);
          }
          if (flight.landing) landings++;
          if (flight.airborne) airTicks++;
          const target = poseAt(near.t + (6 + speed * 0.4) / curve.getLength()).p,
            td = curve.getTangentAt(near.t + (6 + speed * 0.4) / curve.getLength());
          target.addScaledVector(new THREE.Vector3(-td.z, 0, td.x), lane);
          const desired = Math.atan2(-(target.x - p.x), -(target.z - p.z)),
            error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw)),
            steer = Math.abs(error) > 0.035 ? Math.sign(error) : 0;
          const next = driveStep(
            forward,
            lateral,
            { throttle: forward < speed, brake: forward > speed + 2, steer, drift: false },
            false,
            1 / 60,
            vehicle.handling,
          );
          if (flight.grounded) {
            body.setLinvel(
              {
                x: f.x * next.forward + right.x * next.lateral,
                y: v.y,
                z: f.z * next.forward + right.z * next.lateral,
              },
              true,
            );
            body.setAngvel(
              {
                x: 0,
                y: body.angvel().y * (1 - vehicle.response) + next.yaw * vehicle.response,
                z: 0,
              },
              true,
            );
          } else
            body.setAngvel(
              { x: 0, y: body.angvel().y * 0.97 + steer * vehicle.airControl, z: 0 },
              true,
            );
          world.step();
          maxGap = Math.max(maxGap, p.y - 0.34 - surfaceAt(p.x, p.z).height);
          minForward = Math.min(minForward, forward);
        }
        const result = {
          vehicle: vehicle.id,
          speed,
          lane,
          launches,
          landings,
          airTicks,
          maxGap,
          minForward,
          position: body.translation(),
        };
        results.push(result);
        expect(Number.isFinite(body.translation().y)).toBe(true);
        if (lane < 0) {
          expect(launches).toBe(1);
          expect(landings).toBeGreaterThanOrEqual(1);
          expect(airTicks).toBeGreaterThan(15);
          expect(maxGap).toBeGreaterThan(0.35);
        } else {
          expect(launches).toBe(0);
          expect(maxGap).toBeLessThan(0.3);
        }
        world.removeRigidBody(body);
      }
  writeFileSync('test-results/v03-jump.json', JSON.stringify(results, null, 2));
  world.free();
  road.dispose();
  terrain.dispose();
}, 20000);
