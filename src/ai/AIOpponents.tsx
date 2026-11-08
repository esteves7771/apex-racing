import { useRef, useEffect, memo } from 'react';
import {
  RigidBody,
  CuboidCollider,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { race, createVehicleTelemetry, useGame } from '../game/store';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { chassisPhysics } from '../vehicle/physicsGeometry';
import { probeGround } from '../vehicle/GroundContact';
import { JumpDynamics } from '../vehicle/JumpDynamics';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { CarVisual } from '../vehicle/CarVisual';
import { gridSpawn, type CupRacer } from '../game/GrandPrix';
import { bankAt } from '../track/ActiveTrack';
const Opponent = memo(function Opponent({ racer }: { racer: CupRacer }) {
  const ref = useRef<RapierRigidBody>(null),
    jump = useRef(new JumpDynamics()),
    car = getVehicle(racer.vehicle),
    spawn = useRef(gridSpawn(racer.grid)),
    last = useRef(0);
  const state = useRef(createVehicleTelemetry()),
    data = useRef({ kind: 'rival', id: racer.id }),
    { world } = useRapier();
  useEffect(() => {
    racer.body = ref.current ?? undefined;
    return () => {
      racer.body = undefined;
    };
  }, [racer]);
  useBeforePhysicsStep(() => {
    const b = ref.current;
    if (!b?.isValid()) return;
    racer.body = b;
    const p = b.translation(),
      q = b.rotation(),
      v = b.linvel(),
      yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
      f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
      forward = v.x * f.x + v.z * f.z,
      lateral = v.x * right.x + v.z * right.z;
    const contact = probeGround(world, b, f, right),
      ai = racer.ai!;
    if (!['RACING', 'FINISHING', 'RESULTS'].includes(race.phase) || race.gp.completed) {
      b.setLinvel({ x: 0, y: v.y, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      state.current.speed = 0;
      return;
    }
    const flight = jump.current.step({
      t: ai.t ?? spawn.current.t,
      lateral: ai.lateral,
      speed: forward,
      grounded: contact.grounded,
      verticalSpeed: v.y,
      forward: true,
      dt: 1 / 60,
    });
    if (flight.launch !== undefined) {
      v.y = Math.max(v.y, flight.launch);
      b.setLinvel(v, true);
      state.current.jumpCount++;
    }
    if (flight.landing) {
      state.current.landingSerial++;
      state.current.landingStrength = flight.landing;
    }
    const command = ai.update(
      {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw,
        speed: forward,
        lateralSpeed: lateral,
        grounded: flight.grounded,
        finished: racer.progress.finishTime !== null,
      },
      race.gp.traffic(),
    );
    if (ai.needsReset && race.gp.resetRacer(racer.id)) {
      jump.current.reset();
      return;
    }
    applyVehicleCommand(
      b,
      car,
      command,
      Math.abs(ai.lateral) > 6.8,
      flight.grounded,
      flight.airborne,
      forward,
      lateral,
      f,
      right,
      v.y,
    );
    Object.assign(state.current, {
      speed: forward,
      steering: command.steer,
      drift: command.drift,
      braking: command.brake && forward > 0.5,
      airborne: flight.airborne,
      grounded: flight.grounded,
      verticalSpeed: v.y,
      yawRate: b.angvel().y,
      bankAngle: bankAt(ai.t ?? 0),
      groundPitch: Math.atan(-(contact.normal.x * f.x + contact.normal.z * f.z) / contact.normal.y),
      acceleration: (forward - last.current) * 60,
    });
    last.current = forward;
  });
  return (
    <RigidBody
      ref={ref}
      position={[spawn.current.p.x, spawn.current.p.y, spawn.current.p.z]}
      rotation={[0, spawn.current.yaw, 0]}
      colliders={false}
      enabledRotations={[false, true, false]}
      ccd
      canSleep={false}
      linearDamping={0}
      angularDamping={2}
      userData={data.current}
    >
      <CuboidCollider
        args={chassisPhysics.halfExtents}
        mass={car.mass}
        friction={0}
        restitution={0.08}
        contactSkin={chassisPhysics.contactSkin}
      />
      <CarVisual id={racer.vehicle} paint={racer.color} state={state.current} />
    </RigidBody>
  );
});
export function AIOpponents() {
  useGame((s) => s.revision);
  return race.mode === 'gp' && !['MENU', 'MODE_SELECT'].includes(race.phase) ? (
    <group key={race.runId}>
      {race.gp.racers
        .filter((r) => r.id !== 'player')
        .map((r) => (
          <Opponent key={r.id} racer={r} />
        ))}
    </group>
  ) : null;
}
