import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  RigidBody,
  CuboidCollider,
  useBeforePhysicsStep,
  useAfterPhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { BoostState } from './BoostState';
import { canyon, activeTrack } from '../track/ActiveTrack';
import { finishCommand } from '../game/FinishDrive';
import { CarVisual } from './CarVisual';
import { applyVehicleCommand } from './VehicleDynamics';
import { capturePhysicsStep, physicsDiagnostics, usePhysicsDebug } from './physicsDiagnostics';
import { chassisPhysics, vehicleSpawn } from './physicsGeometry';
import { drivingInput } from '../input/keyboard';
import { race, telemetry, useGame, saveRecords } from '../game/store';
import {
  poseAt,
  nearestTrack,
  checkpoints,
  crossedGate,
  curve,
  surfaceAt,
  trackFeatures,
  TRACK_LENGTH,
  trackId,
} from '../track/ActiveTrack';
import { bankAt } from '../track/ActiveTrack';
import { JumpDynamics } from './JumpDynamics';
import { probeGround } from './GroundContact';
import { audioManager } from '../audio/AudioManager';
import { getVehicle } from './VehicleRegistry';
import { gridSpawn } from '../game/GrandPrix';
import { obstacleLayout } from '../game/ObstacleLayout';
import { performanceDiagnostics, recordPhysicsStep } from '../render/frameDiagnostics';
import { FRAME_ORDER } from '../render/frameOrder';
export const carPosition = new THREE.Vector3(0, 0.4, 100);
export const carForward = new THREE.Vector3(0, 0, -1);
const carData = { kind: 'car' };
export function ArcadeVehicleController() {
  const selected = useGame((s) => s.save.settings.vehicle),
    definition = getVehicle(selected);
  const body = useRef<RapierRigidBody>(null),
    visual = useRef<THREE.Group>(null),
    serial = useRef(-1),
    run = useRef(-1),
    previous = useRef(new THREE.Vector3()),
    hudTicks = useRef(0),
    beforeSolver = useRef({ x: 0, y: 0, z: 0 }),
    forwardAxis = useRef({ x: 0, y: 0, z: -1 }),
    jump = useRef(new JumpDynamics()),
    boost = useRef(new BoostState()),
    physicalProgress = useRef(0),
    earnedRoute = useRef('main'),
    lastForward = useRef(0),
    lastVertical = useRef(0),
    { world, rapier } = useRapier();
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { apexDebug: unknown }).apexDebug = {
        race,
        gp: race.gp,
        audio: audioManager,
        obstacles: obstacleLayout,
        vehicle: () => getVehicle(useGame.getState().save.settings.vehicle),
        telemetry,
        body: () => body.current,
        poseAt,
        checkpoints,
        nearestTrack,
        physics: physicsDiagnostics,
        debug: usePhysicsDebug,
        performance: performanceDiagnostics,
        track: { features: trackFeatures, length: TRACK_LENGTH, surfaceAt, curve },
      };
    }
    if (import.meta.env.DEV) performanceDiagnostics.visual = visual.current;
    return () => {
      delete (window as unknown as { apexDebug?: unknown }).apexDebug;
    };
  }, []);
  useBeforePhysicsStep(() => {
    if (
      import.meta.env.DEV &&
      (performanceDiagnostics.enabled || usePhysicsDebug.getState().enabled)
    )
      performanceDiagnostics.stepStart = performance.now();
    const b = body.current;
    if (!b) return;
    if (serial.current !== telemetry.resetSerial) {
      const initial = serial.current === -1 || run.current !== race.runId;
      run.current = race.runId;
      const t = initial ? 0 : checkpoints[race.safeGate].t;
      const spawn =
        race.mode === 'gp' && initial
          ? race.gp.player
            ? gridSpawn(3)
            : vehicleSpawn(-0.016)
          : vehicleSpawn(t + (initial ? -0.006 : 0.0015));
      const gpReset = race.mode === 'gp' && !initial;
      if (!gpReset) {
        b.setTranslation(spawn.p, true);
        b.setRotation(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.yaw),
          true,
        );
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      previous.current.copy(b.translation());
      serial.current = telemetry.resetSerial;
      if (!initial) {
        if (race.mode === 'gp') race.gp.resetRacer('player');
        else
          race.invalidate(
            activeTrack.format === 'sprint' ? 'Reset · sprint invalid' : 'Reset · lap invalid',
          );
      }
      if (race.mode === 'gp' && race.gp.player) {
        race.gp.player.body = b;
        race.gp.player.progress.resetPosition(b.translation(), race.gp.player.progress.t);
      }
      jump.current.reset();
      boost.current.reset();
      const resetNear =
        trackId === 'canyon' ? canyon.nearestTrack(b.translation().x, b.translation().z) : null;
      physicalProgress.current = resetNear?.t ?? t;
      earnedRoute.current = resetNear?.route ?? 'main';
      telemetry.courseRoute = earnedRoute.current;
      telemetry.boostRemaining = 0;
      telemetry.courseProgress = Math.max(0, t);
      telemetry.airborne = false;
      telemetry.landingStrength = 0;
      lastForward.current = 0;
      lastVertical.current = 0;
    }
    race.tick(1 / 60);
    const p = b.translation(),
      q = b.rotation(),
      v = b.linvel();
    const yaw = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(q.x, q.y, q.z, q.w),
      'YXZ',
    ).y;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
      right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = v.x * f.x + v.z * f.z,
      lateral = v.x * right.x + v.z * right.z;
    const near =
      trackId === 'canyon'
        ? canyon.projectProgress(p.x, p.z, physicalProgress.current, earnedRoute.current)
        : nearestTrack(p.x, p.z);
    telemetry.velocityX = v.x;
    telemetry.velocityZ = v.z;
    telemetry.offroad =
      near.distance >
      (trackId === 'canyon'
        ? canyon.roadWidthAt(near.t, (near as { route?: string }).route) / 2 - 0.3
        : 6.8);
    telemetry.yaw = yaw;
    const probe = probeGround(world, b, f, right, trackId === 'canyon' ? 'canyon' : 'default'),
      contact = probe.grounded;
    telemetry.grounded = contact;
    const cooling = race.cooldownActive;
    if (race.phase !== 'RACING' && !cooling) {
      b.setLinvel({ x: 0, y: v.y, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      telemetry.speed = 0;
      telemetry.steering = 0;
      telemetry.drift = false;
      telemetry.braking = false;
      telemetry.acceleration = 0;
      telemetry.verticalSpeed = v.y;
      telemetry.airborne = !contact;
      return;
    }
    const flight = jump.current.step({
      t: near.t,
      route: (near as { route?: string }).route,
      lateral: near.lateral,
      speed: forward,
      grounded: contact,
      verticalSpeed: lastVertical.current,
      forward: f.dot(curve.getTangentAt(near.t)) > 0.5,
      dt: 1 / 60,
    });
    if ((trackId === 'coast' || trackId === 'canyon') && flight.takeoff && forward > 8)
      telemetry.jumpCount++;
    telemetry.grounded = flight.grounded;
    telemetry.airborne = flight.airborne;
    if (flight.launch !== undefined) {
      v.y = Math.max(v.y, flight.launch);
      b.setLinvel(v, true);
      if (trackId !== 'canyon') telemetry.jumpCount++;
    }
    if (flight.landing) {
      telemetry.landingSerial++;
      telemetry.landingStrength = flight.landing;
    }
    telemetry.verticalSpeed = v.y;
    lastVertical.current = v.y;
    telemetry.acceleration = (forward - lastForward.current) * 60;
    lastForward.current = forward;
    telemetry.yawRate = b.angvel().y;
    telemetry.bankAngle = bankAt(near.t);
    telemetry.groundPitch = Math.atan(
      -(probe.normal.x * f.x + probe.normal.z * f.z) / probe.normal.y,
    );
    if (trackId === 'canyon') {
      boost.current.step(
        near.t,
        near.lateral,
        (near as unknown as { route: string }).route,
        telemetry.grounded,
        race.phase === 'RACING',
      );
      telemetry.boostRemaining = boost.current.remaining;
      telemetry.boostSerial = boost.current.serial;
      telemetry.boostExpiredSerial = boost.current.expiredSerial;
    }
    const input = cooling
        ? finishCommand(p.x, p.z, yaw, forward, race.finishElapsed)
        : drivingInput(),
      next = applyVehicleCommand(
        b,
        definition,
        input,
        telemetry.offroad,
        telemetry.grounded,
        flight.airborne,
        forward,
        lateral,
        f,
        right,
        v.y,
        1 / 60,
        boost.current.factor,
      );
    if (import.meta.env.DEV && usePhysicsDebug.getState().enabled) {
      beforeSolver.current = { ...b.linvel() };
      forwardAxis.current = { ...f };
      physicsDiagnostics.grounded = telemetry.grounded;
      physicsDiagnostics.controllerAcceleration = (next.forward - forward) * 60;
      physicsDiagnostics.engineForce = input.throttle
        ? definition.mass *
          definition.handling.acceleration *
          Math.max(
            definition.handling.torqueFloor ?? 0.16,
            1 - Math.max(0, forward) / definition.handling.maxSpeed,
          )
        : 0;
      physicsDiagnostics.brakeForce =
        !input.throttle && input.brake && forward > 0.8
          ? definition.mass * definition.handling.braking
          : 0;
    }
    telemetry.speed = forward;
    telemetry.steering = input.steer;
    telemetry.drift = next.drift;
    telemetry.braking = input.brake && forward > 0.5;
    if (race.phase === 'RACING') {
      if (
        near.distance >
        (trackId === 'canyon'
          ? canyon.roadWidthAt(near.t, (near as { route?: string }).route) / 2 + 1
          : 9)
      )
        race.invalidate(
          activeTrack.format === 'sprint'
            ? 'Off track · sprint invalid'
            : 'Off track · lap invalid',
        );
      if (p.y < -4) telemetry.resetSerial++;
    }
  });
  useAfterPhysicsStep(() => {
    const b = body.current;
    if (!b) return;
    if (
      import.meta.env.DEV &&
      (performanceDiagnostics.enabled || usePhysicsDebug.getState().enabled)
    )
      recordPhysicsStep(b.translation(), b.linvel(), b.rotation(), b.angvel(), telemetry.grounded);
    if (import.meta.env.DEV && usePhysicsDebug.getState().enabled && race.phase === 'RACING')
      capturePhysicsStep(world, b, beforeSolver.current, forwardAxis.current);
    const p = b.translation(),
      current = new THREE.Vector3(p.x, p.y, p.z);
    if (race.mode === 'gp' && ['RACING', 'FINISHING', 'RESULTS'].includes(race.phase)) {
      race.gp.player.body = b;
      race.gp.update(race.simulationTime);
      const progress = race.gp.player.progress;
      race.laps = progress.laps;
      race.nextGate = progress.nextGate;
      race.safeGate = progress.safeGate;
      race.invalid = progress.invalid;
      race.message = progress.invalid
        ? activeTrack.format === 'sprint'
          ? 'Sprint invalid · pass every milestone in order'
          : 'Lap invalid · pass every gate in order'
        : '';
      race.lapStart = progress.lapStart;
      if (progress.finishTime !== null && race.beginFinish(progress.finishTime)) saveRecords();
    } else if (race.phase === 'RACING') {
      for (let i = 0; i < checkpoints.length; i++)
        if (crossedGate(previous.current, current, i)) race.gate(i);
      if ((race.phase as string) === 'FINISHING') saveRecords();
    }
    if (activeTrack.format === 'sprint') {
      const n = canyon.projectProgress(p.x, p.z, physicalProgress.current, earnedRoute.current);
      const lower = checkpoints[Math.min(race.safeGate, checkpoints.length - 1)].t,
        upper = checkpoints[Math.min(race.nextGate, checkpoints.length - 1)].t;
      earnedRoute.current = n.route;
      telemetry.courseRoute = n.route;
      physicalProgress.current = n.t;
      telemetry.courseProgress = Math.max(
        0,
        Math.min(1, race.mode === 'free' ? n.t : Math.max(lower, Math.min(upper, n.t))),
      );
    }
    previous.current.copy(current);
    telemetry.x = p.x;
    telemetry.z = p.z;
    if (++hudTicks.current % 6 === 0) useGame.getState().publish();
  });
  useFrame(() => {
    if (visual.current) {
      visual.current.visible = !['MENU', 'MODE_SELECT'].includes(race.phase);
      visual.current.updateWorldMatrix(true, false);
      carPosition.setFromMatrixPosition(visual.current.matrixWorld);
      carForward.set(0, 0, -1).transformDirection(visual.current.matrixWorld);
    }
  }, FRAME_ORDER.vehiclePose);
  return (
    <RigidBody
      ref={body}
      position={[0, 0.42, 105]}
      colliders={false}
      enabledRotations={[false, true, false]}
      ccd
      canSleep={false}
      userData={carData}
      onCollisionEnter={(e) => {
        if (
          race.mode === 'gp' &&
          (e.other.rigidBody?.userData as { kind?: string })?.kind === 'rival'
        ) {
          const r = race.gp.racers.find(
            (r) => r.id === (e.other.rigidBody?.userData as { id?: string })?.id,
          );
          race.gp.pendingImpact = Math.max(
            race.gp.pendingImpact,
            Math.hypot(
              telemetry.velocityX + Math.sin(r?.yaw ?? 0) * (r?.speed ?? 0),
              telemetry.velocityZ + Math.cos(r?.yaw ?? 0) * (r?.speed ?? 0),
            ),
          );
        }
      }}
      linearDamping={0}
      angularDamping={2}
    >
      <CuboidCollider
        args={chassisPhysics.halfExtents}
        mass={definition.mass}
        friction={0}
        restitution={0.08}
        contactSkin={chassisPhysics.contactSkin}
      />
      <group ref={visual}>
        <CarVisual />
      </group>
    </RigidBody>
  );
}
