import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import {
  checkpoints,
  crossedGate,
  TRACK_LENGTH,
  activeTrack,
  trackId,
  canyon,
  surfaceAt,
  poseAt,
} from '../track/ActiveTrack';
import { CanyonAI } from '../ai/CanyonAI';
import { vehicleSpawn } from '../vehicle/physicsGeometry';
import { RacingAI, rivals, type Difficulty, type Traffic } from '../ai/RacingAI';
import { navAt, projectTrack, clamp } from '../ai/TrackNavigation';
import { getVehicle, type VehicleId } from '../vehicle/VehicleRegistry';
export const GP_RULES_ID = 'cup-3lap-1';
export class RacerProgress {
  laps: number[] = [];
  nextGate = 1;
  safeGate = 0;
  invalid = false;
  finishTime: number | null = null;
  dnf = false;
  lapStart = 0;
  t = 0.99;
  route = 'main';
  lateral = 0;
  score = -10;
  started = false;
  previous = new THREE.Vector3();
  initialized = false;
  constructor(public id: string) {}
  resetPosition(p: { x: number; y: number; z: number }, t: number) {
    this.previous.copy(p);
    this.t = t;
    this.initialized = true;
  }
  update(p: { x: number; y: number; z: number }, elapsed: number) {
    if (this.finishTime !== null || this.dnf) return;
    if (!this.initialized) {
      const near = projectTrack(p.x, p.z);
      this.resetPosition(p, near.t);
    }
    const projection =
      activeTrack.format === 'sprint'
        ? canyon.projectProgress(p.x, p.z, this.t, this.route)
        : projectTrack(p.x, p.z, this.t);
    this.t = projection.t;
    if (activeTrack.format === 'sprint')
      this.route = (projection as unknown as { route: string }).route;
    this.lateral = projection.lateral;
    const current = new THREE.Vector3(p.x, p.y, p.z);
    if (
      projection.distance >
      (activeTrack.format === 'sprint' ? canyon.roadWidthAt(projection.t, this.route) / 2 + 1 : 9)
    )
      this.invalid = true;
    for (let i = 0; i < checkpoints.length; i++)
      if (crossedGate(this.previous, current, i)) this.gate(i, elapsed);
    this.previous.copy(current);
    if (activeTrack.format === 'sprint') {
      // Earned milestones bound standings; branches share canonical progress, never straight-line distance.
      this.score =
        clamp(
          this.t,
          checkpoints[this.safeGate].t,
          checkpoints[Math.min(this.nextGate, checkpoints.length - 1)].t,
        ) * TRACK_LENGTH;
      return;
    }
    let t = this.t;
    if (!this.started && this.safeGate === 0 && t > 0.8) t -= 1;
    const start = checkpoints[this.safeGate].t,
      end = this.nextGate === 0 ? 1 : checkpoints[this.nextGate].t;
    this.score =
      this.laps.length * TRACK_LENGTH + clamp(t, this.started ? start : -0.04, end) * TRACK_LENGTH;
  }
  gate(index: number, elapsed: number) {
    if (this.finishTime !== null || this.dnf) return;
    if (activeTrack.format === 'circuit' && index === 0 && !this.started && this.nextGate === 1) {
      this.started = true;
      return;
    }
    if (index !== this.nextGate) {
      if (index !== this.safeGate) this.invalid = true;
      return;
    }
    this.safeGate = index;
    this.nextGate =
      activeTrack.format === 'sprint'
        ? Math.min(index + 1, checkpoints.length)
        : (index + 1) % checkpoints.length;
    if (activeTrack.format === 'sprint') {
      if (index === checkpoints.length - 1 && !this.invalid) {
        this.laps = [elapsed];
        this.finishTime = elapsed;
      }
      return;
    }
    if (index === 0) {
      if (!this.invalid) this.laps.push(elapsed - this.lapStart);
      this.lapStart = elapsed;
      this.invalid = false;
      if (this.laps.length === 3) this.finishTime = elapsed;
    }
  }
}
export interface CupRacer {
  id: string;
  name: string;
  vehicle: VehicleId;
  color: string;
  grid: number;
  progress: RacerProgress;
  body?: RAPIER.RigidBody;
  ai?: RacingAI;
  speed: number;
  yaw: number;
  x: number;
  z: number;
  resets: number;
}
export function gridSpawn(slot: number) {
  const t = -activeTrack.gridDistances[slot < 2 ? 0 : 1] / TRACK_LENGTH,
    lane = slot % 2 ? 2.15 : -2.15,
    spawn = vehicleSpawn(t, lane);
  return { ...spawn, t: activeTrack.format === 'sprint' ? t : (t + 1) % 1, lane };
}
export class GrandPrixDirector {
  pendingImpact = 0;
  racers: CupRacer[] = [];
  difficulty: Difficulty = 'club';
  activeCount = 3;
  completed = false;
  playerFinishedAt: number | null = null;
  position = 4;
  positionMessage = '';
  messageUntil = 0;
  history: { time: number; order: string[] }[] = [];
  start(vehicle: VehicleId, difficulty: Difficulty) {
    this.pendingImpact = 0;
    this.difficulty = difficulty;
    this.completed = false;
    this.playerFinishedAt = null;
    this.position = 4;
    this.positionMessage = '';
    this.history = [];
    this.racers = [
      {
        id: 'player',
        name: 'You',
        vehicle,
        color: '#f6d35e',
        grid: 3,
        progress: new RacerProgress('player'),
        speed: 0,
        yaw: 0,
        x: 0,
        z: 0,
        resets: 0,
      },
      ...rivals.slice(0, this.activeCount).map((r, i) => ({
        id: r.id,
        name: r.name,
        vehicle: r.vehicle,
        color: r.color,
        grid: [1, 0, 2][i],
        progress: new RacerProgress(r.id),
        ai: new (trackId === 'canyon' ? CanyonAI : RacingAI)(
          getVehicle(r.vehicle),
          r,
          difficulty,
          104 + i * 991,
        ),
        speed: 0,
        yaw: 0,
        x: 0,
        z: 0,
        resets: 0,
      })),
    ];
    for (const r of this.racers) {
      const spawn = gridSpawn(r.grid);
      r.progress.resetPosition(spawn.p, spawn.t);
      r.x = spawn.p.x;
      r.z = spawn.p.z;
      r.yaw = spawn.yaw;
      r.ai?.reset(spawn.t);
    }
    this.position = this.racers.length;
  }
  get player() {
    return this.racers[0];
  }
  get standings() {
    return [...this.racers].sort((a, b) => {
      if (a.progress.finishTime !== null || b.progress.finishTime !== null)
        return (
          (a.progress.finishTime ?? Infinity) - (b.progress.finishTime ?? Infinity) ||
          a.grid - b.grid
        );
      if (a.progress.dnf !== b.progress.dnf) return a.progress.dnf ? 1 : -1;
      const delta = b.progress.score - a.progress.score;
      if (Math.abs(delta) > 0.4) return delta;
      const previous = this.history.at(-1)?.order;
      return previous ? previous.indexOf(a.id) - previous.indexOf(b.id) : a.grid - b.grid;
    });
  }
  traffic(): Traffic[] {
    return this.racers.map((r) => ({
      id: r.id,
      t: r.ai?.t ?? r.progress.t,
      lateral: r.ai?.lateral ?? r.progress.lateral,
      speed: r.speed,
      yaw: r.yaw,
      x: r.x,
      z: r.z,
      finished: r.progress.finishTime !== null,
      route: activeTrack.format === 'sprint' ? r.progress.route : undefined,
    }));
  }
  update(elapsed: number) {
    if (this.completed) return;
    for (const r of this.racers) {
      if (!r.body?.isValid()) continue;
      const p = r.body.translation(),
        q = r.body.rotation(),
        v = r.body.linvel();
      r.x = p.x;
      r.z = p.z;
      r.yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      r.speed = -v.x * Math.sin(r.yaw) - v.z * Math.cos(r.yaw);
      r.progress.update(p, elapsed);
    }
    const order = this.standings.map((r) => r.id),
      position = order.indexOf('player') + 1;
    if (position !== this.position) {
      this.positionMessage = position < this.position ? 'POSITION GAINED' : 'POSITION LOST';
      this.messageUntil = elapsed + 2;
      this.position = position;
    }
    if (elapsed > this.messageUntil) this.positionMessage = '';
    if (this.history.at(-1)?.order.join() !== order.join()) {
      this.history.push({ time: elapsed, order });
      if (this.history.length > 120) this.history.shift();
    }
    if (this.player.progress.finishTime !== null && this.playerFinishedAt === null)
      this.playerFinishedAt = elapsed;
    if (this.playerFinishedAt !== null) {
      if (elapsed - this.playerFinishedAt >= 20)
        for (const r of this.racers) if (r.progress.finishTime === null) r.progress.dnf = true;
      this.completed = this.racers.every((r) => r.progress.finishTime !== null || r.progress.dnf);
    }
  }
  resetRacer(id: string) {
    const r = this.racers.find((r) => r.id === id);
    if (!r?.body?.isValid()) return false;
    const t = checkpoints[r.progress.safeGate].t - 0.004;
    for (const lane of [0, 2.8, -2.8]) {
      const spawn = vehicleSpawn(t, lane),
        p = spawn.p;
      if (this.racers.some((o) => o.id !== id && Math.hypot(o.x - p.x, o.z - p.z) < 6)) continue;
      r.body.setTranslation(spawn.p, true);
      r.body.setRotation(
        { x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) },
        true,
      );
      r.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      r.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      r.progress.invalid = true;
      r.progress.resetPosition(spawn.p, activeTrack.format === 'sprint' ? t : (t + 1) % 1);
      r.ai?.reset(activeTrack.format === 'sprint' ? t : (t + 1) % 1);
      if (r.ai) {
        r.ai.cooldown = 10;
        r.ai.resets++;
      }
      r.resets++;
      return true;
    }
    return false;
  }
}
