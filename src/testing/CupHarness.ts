import { trackId, coast } from '../track/ActiveTrack';
import { coastBarriers, cavern } from '../track/CoastWorld';
import RAPIER from '@dimforge/rapier3d-compat';
import { GrandPrixDirector, gridSpawn } from '../game/GrandPrix';
import { RacingAI, rivals, type Difficulty } from '../ai/RacingAI';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { ribbon, terrainGeometry } from '../track/PineValley';
import { createGroundCollider } from '../track/GroundColliders';
import { barriers } from '../track/TrackMesh';
import { JumpDynamics } from '../vehicle/JumpDynamics';
import { probeGround } from '../vehicle/GroundContact';
export function runCup(
  difficulty: Difficulty = 'club',
  playerAI = false,
  traffic = true,
  maxSeconds = 430,
) {
  const gp = new GrandPrixDirector();
  gp.start('sprinter', difficulty);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const road = trackId === 'pine' ? ribbon(-6, 6, 0.035) : coast.ribbon(-7.25, 7.25, 0.035),
    terrain = trackId === 'pine' ? terrainGeometry() : coast.terrainGeometry();
  createGroundCollider(world, road);
  createGroundCollider(world, terrain);
  if (trackId === 'coast') createGroundCollider(world, cavern);
  for (const b of trackId === 'pine' ? barriers : coastBarriers)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.34, 0.65, b.length / 2)
        .setTranslation(b.p.x, b.p.y + 0.65, b.p.z)
        .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) })
        .setFriction(0.12)
        .setRestitution(0.1),
    );
  if (playerAI)
    gp.player.ai = new RacingAI(
      getVehicle('sprinter'),
      { ...rivals[2], id: 'player' },
      difficulty,
      303,
    );
  const jumps = gp.racers.map(() => new JumpDynamics());
  for (const r of gp.racers) {
    const s = gridSpawn(r.grid);
    r.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.p.x, s.p.y, s.p.z)
        .setRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) })
        .enabledRotations(false, true, false)
        .setCcdEnabled(true)
        .setAngularDamping(2),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
        .setMass(getVehicle(r.vehicle).mass)
        .setFriction(0)
        .setRestitution(0.08)
        .setContactSkin(0.04),
      r.body,
    );
    r.ai?.reset(s.t);
  }
  for (let i = 0; i < 90; i++) world.step();
  const traces: { time: number; racers: unknown[] }[] = [];
  let time = 0,
    resets = 0;
  for (let tick = 0; tick < maxSeconds * 60; tick++) {
    const others = traffic ? gp.traffic() : [];
    gp.racers.forEach((r, i) => {
      const b = r.body!,
        v = b.linvel();
      if (!r.ai) {
        b.setLinvel({ x: 0, y: v.y, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        return;
      }
      const p = b.translation(),
        q = b.rotation(),
        yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
        f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
        right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
        forward = v.x * f.x + v.z * f.z,
        lateral = v.x * right.x + v.z * right.z,
        probe = probeGround(world, b, f, right),
        ai = r.ai;
      const flight = jumps[i].step({
        t: ai.t ?? 0,
        lateral: ai.lateral,
        speed: forward,
        grounded: probe.grounded,
        verticalSpeed: v.y,
        forward: true,
        dt: 1 / 60,
      });
      if (flight.launch !== undefined) v.y = flight.launch;
      const cmd = ai.update(
        {
          x: p.x,
          z: p.z,
          yaw,
          speed: forward,
          grounded: flight.grounded,
          finished: r.progress.finishTime !== null,
        },
        others,
      );
      if (ai.needsReset) {
        if (gp.resetRacer(r.id)) {
          resets++;
          jumps[i].reset();
        }
        return;
      }
      applyVehicleCommand(
        b,
        getVehicle(r.vehicle),
        cmd,
        Math.abs(ai.lateral) > 6.8,
        flight.grounded,
        flight.airborne,
        forward,
        lateral,
        f,
        right,
        v.y,
      );
    });
    world.step();
    time += 1 / 60;
    gp.update(time);
    if (tick % 600 === 0)
      traces.push({
        time,
        racers: gp.racers.map((r) => ({
          id: r.id,
          t: r.progress.t,
          laps: r.progress.laps.length,
          next: r.progress.nextGate,
          speed: r.speed,
          lateral: r.progress.lateral,
          state: r.ai?.state,
          x: r.x,
          z: r.z,
        })),
      });
    if (playerAI ? gp.completed : gp.racers.slice(1).every((r) => r.progress.finishTime !== null))
      break;
  }
  const result = {
    difficulty,
    playerAI,
    traffic,
    time,
    resets,
    completed: gp.completed,
    racers: gp.racers.map((r) => ({
      id: r.id,
      laps: r.progress.laps,
      finish: r.progress.finishTime,
      dnf: r.progress.dnf,
      resets: r.resets,
      gate: r.progress.nextGate,
      t: r.progress.t,
      position: { ...r.body!.translation() },
      state: r.ai?.state,
    })),
    order: gp.standings.map((r) => r.id),
    traces,
  };
  world.free();
  road.dispose();
  terrain.dispose();
  return result;
}
