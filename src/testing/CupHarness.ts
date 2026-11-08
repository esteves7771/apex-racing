import { trackId, coast, roadHeight } from '../track/ActiveTrack';
import { coastBarriers, cavern } from '../track/CoastWorld';
import RAPIER from '@dimforge/rapier3d-compat';
import { GrandPrixDirector, gridSpawn } from '../game/GrandPrix';
import { RacingAI, rivals, type Difficulty } from '../ai/RacingAI';
import { getVehicle, type VehicleId } from '../vehicle/VehicleRegistry';
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
  seed?: number,
  solo?: VehicleId,
) {
  const gp = new GrandPrixDirector();
  gp.start('sprinter', difficulty);
  if (solo) gp.racers = [gp.player, gp.racers.find((r) => r.vehicle === solo && r.ai)!];
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
  for (const r of gp.racers) if (r.ai && seed !== undefined) r.ai.seed = seed + r.grid * 101;
  const metrics = gp.racers.map(() => ({
    ticks: 0,
    distance: 0,
    brakeTicks: 0,
    invalidTicks: 0,
    offroadTicks: 0,
    maxLateral: 0,
    saturatedTicks: 0,
    throttleTicks: 0,
    contacts: 0,
    contactActive: false,
    recoveries: 0,
    recovering: false,
    overtakes: 0,
    lastRank: 0,
    sectorStart: 0,
    cornerMin: Infinity,
    sectors: [] as { gate: number; seconds: number; minCornerSpeed: number | null }[],
  }));
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
    if (solo && !r.ai) r.body.collider(0).setEnabled(false);
    r.ai?.reset(s.t);
  }
  for (let i = 0; i < 90; i++) world.step();
  const probes: unknown[] = [];
  const resetEvents: unknown[] = [];
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
      if (
        process.env.APEX_PROBE &&
        r.id === 'rex' &&
        (ai.t ?? 0) > 0.72 &&
        (ai.t ?? 0) < 0.81 &&
        tick % 10 === 0
      )
        probes.push({
          time,
          t: ai.t,
          x: p.x,
          y: p.y,
          z: p.z,
          road: roadHeight(ai.t!, ai.lateral),
          speed: forward,
          vy: v.y,
          grounded: probe.grounded,
          lateral: ai.lateral,
          target: ai.speedTarget,
        });
      if (
        process.env.APEX_PROBE === 'pine' &&
        r.id === 'nova' &&
        ((ai.t ?? 0) > 0.94 || (ai.t ?? 0) < 0.015) &&
        tick % 10 === 0
      )
        probes.push({
          time,
          t: ai.t,
          speed: forward,
          lateral: ai.lateral,
          offset: ai.offset,
          desired: ai.desiredOffset,
          target: ai.speedTarget,
          state: ai.state,
          commit: ai.commit,
          passing: ai.passingId,
          traffic: others,
        });
      if (flight.launch !== undefined) v.y = flight.launch;
      const cmd = ai.update(
        {
          x: p.x,
          y: p.y,
          z: p.z,
          yaw,
          speed: forward,
          lateralSpeed: lateral,
          grounded: flight.grounded,
          finished: r.progress.finishTime !== null,
        },
        others,
      );
      if (
        process.env.APEX_V07_PROBE &&
        r.id === 'rex' &&
        r.progress.laps.length === 1 &&
        tick % 6 === 0
      )
        probes.push({
          time,
          t: ai.t,
          speed: forward,
          target: ai.speedTarget,
          lateral: ai.lateral,
          offset: ai.offset,
          desired: ai.desiredOffset,
          steer: ai.steer,
          grounded: flight.grounded,
          command: { ...cmd },
        });
      if (ai.needsReset) {
        resetEvents.push({
          time,
          id: r.id,
          t: ai.t,
          lateral: ai.lateral,
          speed: forward,
          y: p.y,
          grounded: probe.grounded,
          state: ai.state,
          stuck: ai.stuck,
          recovery: ai.recovery,
          belowRoad: ai.belowRoad,
        });
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
    const gates = gp.racers.map((r) => r.progress.nextGate);
    gp.update(time);
    gp.racers.forEach((r, i) => {
      const m = metrics[i];
      if (!r.ai || r.progress.finishTime !== null) return;
      m.ticks++;
      m.distance += Math.abs(r.speed) / 60;
      m.invalidTicks += Number(r.progress.invalid);
      m.offroadTicks += Number(Math.abs(r.ai.lateral) > 6.8);
      m.maxLateral = Math.max(m.maxLateral, Math.abs(r.ai.lateral));
      m.saturatedTicks += Number(Math.abs(r.ai.steer) > 0.98);
      m.brakeTicks += Number(r.ai.command.brake);
      m.throttleTicks += Number(r.ai.command.throttle);
      if (Math.abs(r.ai.steer) > 0.3 && time > 4)
        m.cornerMin = Math.min(m.cornerMin, Math.abs(r.speed));
      const rank = gp.standings.indexOf(r);
      if (time > 5 && m.lastRank > rank) m.overtakes++;
      m.lastRank = rank;
      const recovering = ['RECOVER', 'BACK_OUT'].includes(r.ai.state);
      if (recovering && !m.recovering) m.recoveries++;
      m.recovering = recovering;
      let contact = false;
      world.contactPairsWith(r.body!.collider(0), (other) => {
        if (
          other.parent() &&
          gp.racers.some((o) => o !== r && o.body?.handle === other.parent()!.handle)
        )
          contact = true;
      });
      if (contact && !m.contactActive) m.contacts++;
      m.contactActive = contact;
      if (gates[i] !== r.progress.nextGate) {
        m.sectors.push({
          gate: gates[i],
          seconds: time - m.sectorStart,
          minCornerSpeed: Number.isFinite(m.cornerMin) ? m.cornerMin : null,
        });
        m.cornerMin = Infinity;
        m.sectorStart = time;
      }
    });
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
          ai: r.ai
            ? {
                offset: r.ai.offset,
                desired: r.ai.desiredOffset,
                passing: r.ai.passingId,
                commit: r.ai.commit,
                target: { ...r.ai.target },
                speedTarget: r.ai.speedTarget,
                command: { ...r.ai.command },
                yaw: r.yaw,
              }
            : undefined,
          x: r.x,
          z: r.z,
        })),
      });
    if (playerAI ? gp.completed : gp.racers.slice(1).every((r) => r.progress.finishTime !== null))
      break;
  }
  const result = {
    difficulty,
    seed,
    solo,
    metrics: metrics.map((m, i) => ({
      id: gp.racers[i].id,
      averageSpeed: m.distance / Math.max(1 / 60, m.ticks / 60),
      brakingSeconds: m.brakeTicks / 60,
      invalidSeconds: m.invalidTicks / 60,
      offroadSeconds: m.offroadTicks / 60,
      maxLateral: m.maxLateral,
      steeringSaturation: m.saturatedTicks / Math.max(1, m.ticks),
      throttleUtilization: m.throttleTicks / Math.max(1, m.ticks),
      contactEpisodes: m.contacts,
      recoveryEvents: m.recoveries,
      overtakes: m.overtakes,
      sectors: m.sectors,
    })),
    playerAI,
    traffic,
    time,
    resets,
    resetEvents,
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
    probes,
  };
  world.free();
  road.dispose();
  terrain.dispose();
  return result;
}
