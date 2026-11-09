import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as canyon from '../track/CanyonCarnival';
import { selectTrack } from '../track/ActiveTrack';
import { GrandPrixDirector, gridSpawn } from '../game/GrandPrix';
import { CanyonAI } from '../ai/CanyonAI';
import { rivals, type Difficulty } from '../ai/RacingAI';
import { getVehicle, type VehicleId } from '../vehicle/VehicleRegistry';
import { applyVehicleCommand } from '../vehicle/VehicleDynamics';
import { BoostState } from '../vehicle/BoostState';
import { JumpDynamics } from '../vehicle/JumpDynamics';
import { probeGround } from '../vehicle/GroundContact';
import { canyonTunnelGeometry } from '../track/CanyonStructures';
import { createGroundCollider } from '../track/GroundColliders';
function createCanyonWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  createGroundCollider(world, canyon.roadGeometry);
  const terrain = canyon.terrainGeometry();
  createGroundCollider(world, terrain);
  terrain.dispose();
  const tunnel = canyonTunnelGeometry(canyon);
  createGroundCollider(world, tunnel);
  tunnel.dispose();
  for (const b of canyon.barriers)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.18, 0.65, b.length / 2)
        .setTranslation(b.p.x, b.p.y + 0.65, b.p.z)
        .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) })
        .setFriction(0.12)
        .setRestitution(0.1),
    );
  for (const [index, o] of canyon.solidObstacles.entries()) {
    const pose = canyon.routePose(o.t, o.route, o.lateral),
      p = pose.p,
      rotation = { x: 0, y: Math.sin(pose.yaw / 2), z: 0, w: Math.cos(pose.yaw / 2) };
    if (index % 2 === 0)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(o.radius, o.radius * 0.6, o.radius)
          .setTranslation(p.x, p.y + 0.035 + o.radius * 0.6, p.z)
          .setRotation(rotation)
          .setFriction(0.3),
      );
    else {
      const g = new THREE.DodecahedronGeometry(o.radius);
      g.scale(1, 1.1, 1);
      world.createCollider(
        RAPIER.ColliderDesc.convexHull(g.getAttribute('position').array as Float32Array)!
          .setTranslation(p.x, p.y + o.radius * 1.1, p.z)
          .setRotation(rotation)
          .setFriction(0.3),
      );
      g.dispose();
    }
  }
  return world;
}
export function runCanyon(
  carId: VehicleId = 'bolt',
  difficulty: Difficulty = 'pro',
  forcedRoute?: string,
  maxSeconds = 450,
) {
  selectTrack('canyon');
  const car = getVehicle(carId),
    rival = rivals.find((r) => r.vehicle === carId)!,
    ai = new CanyonAI(car, rival, difficulty, 41),
    world = createCanyonWorld();
  ai.forcedRoute = forcedRoute;
  const spawn = canyon.routePose(-0.003);
  spawn.p.y += 0.5;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.p.x, spawn.p.y, spawn.p.z)
      .setRotation({ x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) })
      .enabledRotations(false, true, false)
      .setAngularDamping(2)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
      .setContactSkin(0.04)
      .setMass(car.mass)
      .setFriction(0)
      .setRestitution(0.08),
    body,
  );
  for (let i = 0; i < 90; i++) world.step();
  ai.reset(-0.003);
  const boost = new BoostState(),
    jump = new JumpDynamics(),
    previous = new THREE.Vector3().copy(body.translation());
  let nextGate = 1,
    time = 0,
    maxLateral = 0,
    maxSpeed = 0,
    offroad = 0,
    minY = Infinity,
    launched = 0,
    landed = 0,
    throttleTicks = 0,
    brakeTicks = 0;
  const trace: unknown[] = [];
  const routeCoverage: Record<string, number> = {};
  const jumpEvidence: Record<string, { takeoffs: number; airtime: number; landings: number }> = {};
  let complete = false;
  for (let tick = 0; tick < maxSeconds * 60; tick++) {
    const p = body.translation(),
      q = body.rotation(),
      v = body.linvel(),
      yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
      f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
      forward = v.x * f.x + v.z * f.z,
      lateral = v.x * right.x + v.z * right.z,
      near = canyon.projectRoute(p.x, p.z, ai.t),
      probe = probeGround(world, body, f, right, 'canyon');
    const flight = jump.step({
      t: near.t,
      route: near.route,
      lateral: near.lateral,
      speed: forward,
      grounded: probe.grounded,
      verticalSpeed: v.y,
      forward: true,
      dt: 1 / 60,
    });
    if (flight.launch !== undefined) {
      v.y = Math.max(v.y, flight.launch);
      body.setLinvel(v, true);
      launched++;
    }
    if (flight.landing) landed++;
    const opportunity = canyon.jumps.find(
      (j) =>
        j.route === near.route &&
        Math.abs((near.t - j.t) * canyon.TRACK_LENGTH) < 70 &&
        Math.abs(near.lateral - j.lateral) < 2.2,
    );
    if (opportunity) {
      const evidence = (jumpEvidence[opportunity.id] ??= { takeoffs: 0, airtime: 0, landings: 0 });
      if (flight.takeoff) evidence.takeoffs++;
      if (flight.airborne) evidence.airtime += 1 / 60;
      if (flight.landing) evidence.landings++;
    }

    const factor = boost.step(near.t, near.lateral, near.route, flight.grounded, true),
      command = ai.update({
        x: p.x,
        y: p.y,
        z: p.z,
        yaw,
        speed: forward,
        lateralSpeed: lateral,
        grounded: flight.grounded,
        boostRemaining: boost.remaining,
      });
    if (
      near.route !== 'main' &&
      near.distance < 2.5 &&
      canyon.projectRoute(p.x, p.z, undefined, 'main').distance >
        canyon.roadWidthAt(near.t, 'main') / 2 + 0.6
    )
      routeCoverage[near.route] = (routeCoverage[near.route] ?? 0) + 1 / 60;
    if (command.throttle) throttleTicks++;
    if (command.brake) brakeTicks++;
    applyVehicleCommand(
      body,
      car,
      command,
      near.distance > canyon.roadWidthAt(near.t, near.route) / 2,
      flight.grounded,
      flight.airborne,
      forward,
      lateral,
      f,
      right,
      v.y,
      1 / 60,
      factor,
    );
    world.step();
    time = (tick + 1) / 60;
    const current = new THREE.Vector3().copy(body.translation());
    if (nextGate < canyon.checkpoints.length && canyon.crossedGate(previous, current, nextGate))
      nextGate++;
    previous.copy(current);
    maxLateral = Math.max(maxLateral, near.distance);
    maxSpeed = Math.max(maxSpeed, forward);
    if (near.distance > canyon.roadWidthAt(near.t, near.route) / 2) offroad += 1 / 60;
    minY = Math.min(minY, p.y);
    if (tick % 300 === 0 || (process.env.APEX_CANYON_TRACE && tick % 12 === 0))
      trace.push({
        time,
        t: ai.t,
        route: ai.route,
        nearRoute: near.route,
        lateral: near.lateral,
        speed: forward,
        target: ai.speedTarget,
        yaw,
        steer: command.steer,
        vy: v.y,
        grounded: flight.grounded,
        contact: probe.distance,
        targetPoint: { ...ai.target },
        expectedRoad: canyon.routePose(near.t, near.route, near.lateral).p.y,
        state: ai.state,
        x: p.x,
        y: p.y,
        z: p.z,
      });
    if (nextGate === canyon.checkpoints.length) {
      complete = true;
      break;
    }
    if (p.y < -25 || ai.recovery > 8) break;
  }
  const result = {
    car: carId,
    difficulty,
    forcedRoute: forcedRoute ?? null,
    complete,
    time,
    nextGate,
    maxLateral,
    maxSpeed,
    offroad,
    minY,
    boosts: boost.serial,
    jumps: launched,
    jumpEvidence,
    landings: landed,
    recoveries: ai.recovery,
    usedRoutes: ai.usedRoutes,
    routeCoverage,
    choices: Object.fromEntries(ai.choices),
    position: { ...body.translation() },
    t: ai.t,
    state: ai.state,
    throttleFraction: throttleTicks / (time * 60),
    brakeFraction: brakeTicks / (time * 60),
    trace,
  };
  world.free();
  selectTrack('pine');
  return result;
}

/** Four physical racers, canonical milestone scoring and the real post-player GP resolution window. */
export function runCanyonTraffic(
  difficulty: Difficulty = 'club',
  forcedRoute?: string,
  maxSeconds = 450,
  playerCar: VehicleId = 'sprinter',
) {
  selectTrack('canyon');
  const gp = new GrandPrixDirector();
  gp.start(playerCar, difficulty);
  gp.player.ai = new CanyonAI(
    getVehicle(playerCar),
    { ...rivals.find((r) => r.vehicle === playerCar)!, id: 'player' },
    difficulty,
    303,
  );
  const world = createCanyonWorld(),
    jumps = gp.racers.map(() => new JumpDynamics()),
    boosts = gp.racers.map(() => new BoostState()),
    coverage = gp.racers.map(() => ({}) as Record<string, number>),
    offroad = gp.racers.map(() => 0);
  for (const r of gp.racers) {
    const spawn = gridSpawn(r.grid),
      car = getVehicle(r.vehicle);
    r.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.p.x, spawn.p.y, spawn.p.z)
        .setRotation({ x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) })
        .enabledRotations(false, true, false)
        .setAngularDamping(2)
        .setCcdEnabled(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.7)
        .setContactSkin(0.04)
        .setMass(car.mass)
        .setFriction(0)
        .setRestitution(0.08),
      r.body,
    );
    (r.ai as CanyonAI).forcedRoute = forcedRoute;
    r.ai!.reset(spawn.t);
    r.progress.resetPosition(spawn.p, spawn.t);
  }
  for (let i = 0; i < 90; i++) world.step();
  const trace: unknown[] = [];
  let time = 0;
  for (let tick = 0; tick < maxSeconds * 60; tick++) {
    const traffic = gp.traffic();
    gp.racers.forEach((r, index) => {
      const b = r.body!,
        p = b.translation(),
        q = b.rotation(),
        v = b.linvel(),
        yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
        f = { x: -Math.sin(yaw), z: -Math.cos(yaw) },
        right = { x: Math.cos(yaw), z: -Math.sin(yaw) },
        forward = v.x * f.x + v.z * f.z,
        lateral = v.x * right.x + v.z * right.z,
        near = canyon.projectRoute(p.x, p.z, r.ai!.t),
        probe = probeGround(world, b, f, right, 'canyon');
      const flight = jumps[index].step({
        t: near.t,
        route: near.route,
        lateral: near.lateral,
        speed: forward,
        grounded: probe.grounded,
        verticalSpeed: v.y,
        forward: true,
        dt: 1 / 60,
      });
      if (flight.launch !== undefined) {
        v.y = Math.max(v.y, flight.launch);
        b.setLinvel(v, true);
      }
      const boost = boosts[index],
        factor = boost.step(near.t, near.lateral, near.route, flight.grounded, true),
        command = (r.ai as CanyonAI).update(
          {
            x: p.x,
            y: p.y,
            z: p.z,
            yaw,
            speed: forward,
            lateralSpeed: lateral,
            grounded: flight.grounded,
            boostRemaining: boost.remaining,
            finished: r.progress.finishTime !== null,
          },
          traffic,
        );
      applyVehicleCommand(
        b,
        getVehicle(r.vehicle),
        command,
        near.distance > canyon.roadWidthAt(near.t, near.route) / 2,
        flight.grounded,
        flight.airborne,
        forward,
        lateral,
        f,
        right,
        v.y,
        1 / 60,
        factor,
      );
      if (near.distance > canyon.roadWidthAt(near.t, near.route) / 2) offroad[index] += 1 / 60;
      if (
        near.route !== 'main' &&
        near.distance < 2.5 &&
        canyon.projectRoute(p.x, p.z, undefined, 'main').distance >
          canyon.roadWidthAt(near.t, 'main') / 2 + 0.6
      )
        coverage[index][near.route] = (coverage[index][near.route] ?? 0) + 1 / 60;
    });
    world.step();
    time = (tick + 1) / 60;
    gp.update(time);
    if (tick % 600 === 0)
      trace.push({
        time,
        racers: gp.racers.map((r) => ({
          id: r.id,
          t: r.ai!.t,
          route: (r.ai as CanyonAI).route,
          state: r.ai!.state,
          speed: r.speed,
          target: r.ai!.speedTarget,
          x: r.x,
          z: r.z,
          invalid: r.progress.invalid,
          ...(process.env.APEX_CANYON_CONTACTS && Math.abs(r.speed) < 2
            ? {
                body: { ...r.body!.translation() },
                offset: r.ai!.offset,
                targetPoint: r.ai!.target,
                contacts: (() => {
                  const rows: unknown[] = [];
                  world.contactPairsWith(r.body!.collider(0), (other) => {
                    world.contactPair(r.body!.collider(0), other, (m) =>
                      rows.push({
                        shape: other.shapeType(),
                        position: { ...other.translation() },
                        normal: { ...m.normal() },
                        solver: m.numSolverContacts(),
                        otherRacer: gp.racers.find((o) => o.body === other.parent())?.id ?? null,
                      }),
                    );
                  });
                  return rows;
                })(),
              }
            : {}),
        })),
      });
    if (gp.completed || gp.racers.some((r) => r.body!.translation().y < -25)) break;
  }
  const result = {
    difficulty,
    playerCar,
    forcedRoute: forcedRoute ?? null,
    time,
    completed: gp.completed,
    order: gp.standings.map((r) => r.id),
    racers: gp.racers.map((r, i) => ({
      id: r.id,
      vehicle: r.vehicle,
      finish: r.progress.finishTime,
      dnf: r.progress.dnf,
      invalid: r.progress.invalid,
      gate: r.progress.nextGate,
      t: r.ai!.t,
      route: (r.ai as CanyonAI).route,
      used: (r.ai as CanyonAI).usedRoutes,
      coverage: coverage[i],
      offroad: offroad[i],
      recoveries: r.ai!.recovery,
      boosts: boosts[i].serial,
    })),
    trace,
  };
  world.free();
  selectTrack('pine');
  return result;
}
