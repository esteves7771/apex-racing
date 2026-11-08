import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import * as currentTrack from '../track/PineValley';
import * as legacyTrack from './LegacyPineValley';
import { driveStep, type VehicleConfig } from '../vehicle/VehicleConfig';
import { createGroundCollider, GROUND_TRIMESH_FLAGS } from '../track/GroundColliders';
import { barriers } from '../track/TrackMesh';

export type SurfaceCase = 'flat' | 'terrain' | 'road' | 'both';
export interface RunOptions {
  follow?: boolean;
  drift?: boolean;
  brakeAfter?: number;
  offset?: number;
  barriers?: boolean;
  steer?: number;
  ccd?: boolean;
  skin?: number;
  ccdSubsteps?: number;
  initialSpeed?: number;
  throttle?: boolean;
  surfaceTangent?: boolean;
  legacy?: boolean;
  config?: VehicleConfig;
  response?: number;
  mass?: number;
}
export function collisionRun(
  surface: SurfaceCase,
  flags: number = GROUND_TRIMESH_FLAGS,
  start = -0.006,
  seconds = 3,
  options: RunOptions = {},
) {
  const { poseAt, ribbon, terrainGeometry, nearestTrack } =
    options.legacy === false ? currentTrack : legacyTrack;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  if (options.ccdSubsteps !== undefined)
    world.integrationParameters.maxCcdSubsteps = options.ccdSubsteps;
  const labels = new Map<number, string>();
  const addMesh = (g: THREE.BufferGeometry, label: string) => {
    const c = createGroundCollider(world, g, flags);
    labels.set(c.handle, label);
    g.dispose();
  };
  if (surface === 'flat')
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(650, 0.5, 650).setTranslation(100, -0.5, 50).setFriction(0),
    );
  if (surface === 'terrain' || surface === 'both') addMesh(terrainGeometry(), 'terrain');
  if (surface === 'road' || surface === 'both') addMesh(ribbon(-6, 6, 0.035), 'road');
  if (options.barriers)
    for (const b of barriers) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.34, 0.65, b.length / 2)
          .setTranslation(b.p.x, b.p.y + 0.65, b.p.z)
          .setRotation(q)
          .setFriction(0.12)
          .setRestitution(0.1),
      );
      labels.set(c.handle, 'barrier');
    }
  const spawn = poseAt(start),
    q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.yaw);
  spawn.p.x += Math.cos(spawn.yaw) * (options.offset ?? 0);
  spawn.p.z -= Math.sin(spawn.yaw) * (options.offset ?? 0);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.p.x, surface === 'flat' ? 0.42 : spawn.p.y + 0.42, spawn.p.z)
      .setRotation(q)
      .enabledRotations(false, true, false)
      .setCcdEnabled(options.ccd ?? true)
      .setAngularDamping(2),
  );
  const chassis = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
      .setMass(options.mass ?? 850)
      .setFriction(0)
      .setRestitution(0.08)
      .setContactSkin(options.skin ?? 0),
    body,
  );
  for (let i = 0; i < 90; i++) {
    const v = body.linvel();
    body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
    world.step();
  }
  if (options.initialSpeed !== undefined)
    body.setLinvel(
      {
        x: -Math.sin(spawn.yaw) * options.initialSpeed,
        y: 0,
        z: -Math.cos(spawn.yaw) * options.initialSpeed,
      },
      true,
    );
  const motion: { tick: number; expected: number; actual: number; ratio: number }[] = [];
  const vertical: { y: number; vy: number; grounded: boolean; yaw: number }[] = [];
  const events: {
    tick: number;
    loss: number;
    before: number;
    after: number;
    position: ReturnType<typeof body.translation>;
    contacts: unknown[];
  }[] = [];
  let worstLoss = 0,
    groundedTicks = 0,
    maxTrackDistance = 0,
    minHeight = Infinity;
  const speedSamples: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const yaw = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().copy(body.rotation()),
      'YXZ',
    ).y;
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const p = body.translation(),
      v = body.linvel(),
      forward = v.x * f.x + v.z * f.z,
      lateral = v.x * right.x + v.z * right.z;
    const near = nearestTrack(p.x, p.z);
    maxTrackDistance = Math.max(maxTrackDistance, near.distance);
    minHeight = Math.min(minHeight, p.y);
    let steer = options.steer ?? 0;
    if (options.follow) {
      const target = poseAt(near.t + (6 + Math.abs(forward) * 0.4) / 1286),
        desired = Math.atan2(-(target.p.x - p.x), -(target.p.z - p.z)),
        error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
      steer = Math.abs(error) > 0.035 ? Math.sign(error) : 0;
    }
    const hit = world.castRayAndGetNormal(
      new RAPIER.Ray(p, { x: 0, y: -1, z: 0 }),
      0.85,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );
    const grounded = hit !== null;
    const braking = options.brakeAfter !== undefined && i >= options.brakeAfter * 60;
    const next = driveStep(
      forward,
      lateral,
      {
        throttle: (options.throttle ?? true) && !braking && (!options.follow || forward < 18),
        brake: braking,
        steer,
        drift: !!options.drift,
      },
      false,
      1 / 60,
      options.config,
    );
    if (grounded) {
      groundedTicks++;
      body.setLinvel(
        {
          x: f.x * next.forward + right.x * next.lateral,
          y:
            options.surfaceTangent && hit && hit.normal.y > 0.6
              ? -(
                  hit.normal.x * (f.x * next.forward + right.x * next.lateral) +
                  hit.normal.z * (f.z * next.forward + right.z * next.lateral)
                ) / hit.normal.y
              : v.y,
          z: f.z * next.forward + right.z * next.lateral,
        },
        true,
      );
      const response = options.response ?? 0.22;
      body.setAngvel(
        { x: 0, y: body.angvel().y * (1 - response) + next.yaw * response, z: 0 },
        true,
      );
    }
    const before = body.linvel();
    const beforePosition = { ...body.translation() };
    world.step();
    const after = body.linvel();
    const loss = (before.x - after.x) * f.x + (before.z - after.z) * f.z;
    worstLoss = Math.max(worstLoss, loss);
    speedSamples.push(after.x * f.x + after.z * f.z);
    vertical.push({ y: body.translation().y, vy: after.y, grounded, yaw });
    const afterPosition = body.translation(),
      expected = (before.x * f.x + before.z * f.z) / 60,
      actual =
        (afterPosition.x - beforePosition.x) * f.x + (afterPosition.z - beforePosition.z) * f.z;
    if (Math.abs(expected) > 0.01)
      motion.push({ tick: i, expected, actual, ratio: actual / expected });
    if (loss > 0.8) {
      const contacts: unknown[] = [];
      world.contactPairsWith(chassis, (c) => {
        world.contactPair(chassis, c, (m) => {
          contacts.push({
            surface: labels.get(c.handle),
            normal: m.normal(),
            impulses: Array.from({ length: m.numContacts() }, (_, i) => m.contactImpulse(i)),
          });
        });
      });
      events.push({
        tick: i,
        loss,
        before: before.x * f.x + before.z * f.z,
        after: after.x * f.x + after.z * f.z,
        position: body.translation(),
        contacts,
      });
    }
  }
  const v = body.linvel(),
    qEnd = body.rotation(),
    yawEnd = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().copy(qEnd), 'YXZ').y,
    result = {
      surface,
      flags,
      worstLoss,
      finalSpeed: -v.x * Math.sin(yawEnd) - v.z * Math.cos(yawEnd),
      groundedTicks,
      totalTicks: seconds * 60,
      maxTrackDistance,
      minHeight,
      position: { ...body.translation() },
      rotation: { ...qEnd },
      speedSamples,
      events,
      motion,
      vertical,
    };
  world.free();
  return result;
}
