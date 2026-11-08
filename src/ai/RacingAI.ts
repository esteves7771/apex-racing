import { navAt, projectTrack, routeOffset, clamp, angle, signedDistance } from './TrackNavigation';
import { TRACK_LENGTH, unsafeRoute } from '../track/ActiveTrack';
import type { VehicleDefinition, VehicleId } from '../vehicle/VehicleRegistry';
export type Difficulty = 'rookie' | 'club' | 'pro';
export const difficulties = {
  rookie: {
    label: 'Rookie',
    pace: 0.81,
    corner: 0.81,
    braking: 0.65,
    reaction: 0.18,
    precision: 0.16,
    confidence: 0.55,
    mistake: 0.13,
  },
  club: {
    label: 'Club',
    pace: 0.94,
    corner: 0.94,
    braking: 0.8,
    reaction: 0.12,
    precision: 0.09,
    confidence: 0.8,
    mistake: 0.07,
  },
  pro: {
    label: 'Pro',
    pace: 1,
    corner: 1,
    braking: 0.92,
    reaction: 0.08,
    precision: 0.035,
    confidence: 1,
    mistake: 0.025,
  },
} as const;
export const rivals = [
  {
    id: 'rex',
    name: 'Rex',
    vehicle: 'bolt' as VehicleId,
    color: '#ee825d',
    personality: 'Aggressive',
    lane: -0.45,
    braking: 1.04,
    pass: -1,
    patience: 0.8,
  },
  {
    id: 'nova',
    name: 'Nova',
    vehicle: 'vortex' as VehicleId,
    color: '#bba7f0',
    personality: 'Speed specialist',
    lane: 0.35,
    braking: 0.92,
    pass: 1,
    patience: 1.1,
  },
  {
    id: 'milo',
    name: 'Milo',
    vehicle: 'sprinter' as VehicleId,
    color: '#60d8d4',
    personality: 'Consistent',
    lane: 0,
    braking: 1,
    pass: 1,
    patience: 1.3,
  },
];
export type Rival = (typeof rivals)[number];
export interface Traffic {
  id: string;
  t: number;
  lateral: number;
  speed: number;
  x: number;
  z: number;
  finished?: boolean;
  yaw?: number;
}
export function cornerSpeed(t: number, car: VehicleDefinition, difficulty: Difficulty) {
  const d = difficulties[difficulty],
    k = Math.abs(navAt(t).curvature);
  // Available yaw authority as well as lateral grip limits the arcade turning radius.
  const authority = car.handling.steering * 0.94 * d.corner;
  return Math.min(
    car.handling.maxSpeed * d.pace,
    authority / (k + (authority * (car.handling.steeringFalloff ?? 0.48)) / car.handling.maxSpeed),
    Math.sqrt((car.handling.grip * 0.98 * d.corner) / Math.max(k, 0.001)),
  );
}
export function plannedSpeed(
  t: number,
  car: VehicleDefinition,
  difficulty: Difficulty,
  braking = 1,
) {
  let limit = cornerSpeed(t, car, difficulty);
  const decel = car.handling.braking * difficulties[difficulty].braking * braking;
  for (let distance = 4; distance <= 110; distance += 4) {
    const ahead = (t + distance / TRACK_LENGTH) % 1,
      v = cornerSpeed(ahead, car, difficulty);
    limit = Math.min(limit, Math.sqrt(v * v + 2 * decel * Math.max(0, distance - 5)));
  }
  if (unsafeRoute(t)) limit = Math.min(limit, 24);
  return Math.max(6.5, limit);
}
export class RacingAI {
  t: number | undefined;
  lateral = 0;
  offset = 0;
  desiredOffset = 0;
  speedTarget = 0;
  steer = 0;
  state = 'GRID';
  target = { x: 0, y: 0, z: 0 };
  lookahead = 0;
  decision = 0;
  commit = 0;
  stuck = 0;
  recovery = 0;
  cooldown = 0;
  resets = 0;
  costMs = 0;
  totalCostMs = 0;
  updates = 0;
  throttleState: 'throttle' | 'brake' | 'coast' = 'throttle';
  seed: number;
  clock = 0;
  command = { throttle: false, brake: false, steer: 0, drift: false };
  constructor(
    public car: VehicleDefinition,
    public rival: Rival,
    public difficulty: Difficulty = 'club',
    seed = 41,
  ) {
    this.seed = seed;
  }
  reset(t: number) {
    this.t = t;
    this.offset = 0;
    this.desiredOffset = 0;
    this.steer = 0;
    this.decision = 0;
    this.commit = 0;
    this.stuck = 0;
    this.recovery = 0;
    this.cooldown = 0;
    this.state = 'GRID';
    this.clock = 0;
    this.throttleState = 'throttle';
  }
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  update(
    input: {
      x: number;
      z: number;
      yaw: number;
      speed: number;
      grounded: boolean;
      finished?: boolean;
    },
    traffic: Traffic[] = [],
    dt = 1 / 60,
  ) {
    const started = performance.now(),
      projection = projectTrack(input.x, input.z, this.t);
    this.t = projection.t;
    this.lateral = projection.lateral;
    this.clock += dt;
    this.commit = Math.max(0, this.commit - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.decision -= dt;
    const d = difficulties[this.difficulty],
      speed = Math.abs(input.speed);
    if (this.decision <= 0) {
      this.decision = d.reaction;
      this.speedTarget = plannedSpeed(this.t, this.car, this.difficulty, this.rival.braking);
      const unsafe = unsafeRoute(this.t),
        curve = Math.abs(navAt(this.t + 0.012).curvature);
      const nearby = traffic.filter(
        (o) => o.id !== this.rival.id && Math.hypot(input.x - o.x, input.z - o.z) < 45,
      );
      const ahead = nearby
        .filter((o) => {
          const gap = signedDistance(this.t!, o.t);
          return gap > 0 && gap < 30 && Math.abs(o.lateral - this.lateral) < 2.3;
        })
        .sort((a, b) => signedDistance(this.t!, a.t) - signedDistance(this.t!, b.t))[0];
      const currentCurve = navAt(this.t).curvature,
        comingCurve = navAt(this.t + 0.012).curvature;
      let desired =
        this.rival.lane +
        (this.t > 0.05 && this.t < 0.95
          ? clamp((comingCurve - currentCurve) * 20, -0.35, 0.35)
          : 0);
      if (
        this.commit > 0 &&
        nearby.some(
          (o) =>
            Math.abs(signedDistance(this.t!, o.t)) < 12 &&
            Math.abs(o.lateral - this.desiredOffset) < 2.2,
        )
      ) {
        this.commit = 0;
        this.desiredOffset = this.rival.lane;
        this.state = 'YIELD';
      }
      if (ahead) {
        const aheadSpeed =
          ahead.yaw !== undefined && Math.cos(ahead.yaw - navAt(ahead.t).yaw) < 0 ? 0 : ahead.speed;
        const gap = signedDistance(this.t, ahead.t),
          canPass =
            !unsafe && curve < 0.026 && gap > 3.7 && (speed > aheadSpeed + 0.5 || aheadSpeed < 1.2);
        let pass = 0;
        const preference =
          Math.abs(comingCurve) > 0.002
            ? this.rival.id === 'rex'
              ? -Math.sign(comingCurve)
              : this.rival.id === 'nova'
                ? Math.sign(comingCurve)
                : this.rival.pass
            : this.rival.pass;
        if (canPass) {
          for (const side of [preference, -preference]) {
            const lane = side * 2.9;
            if (
              !nearby.some(
                (o) =>
                  Math.abs(signedDistance(this.t!, o.t)) < 18 && Math.abs(o.lateral - lane) < 2.4,
              )
            ) {
              pass = lane;
              break;
            }
          }
        }
        if (pass && this.commit === 0 && this.random() < d.confidence) {
          this.desiredOffset = pass;
          this.commit = 2.8 * this.rival.patience;
          this.state = 'OVERTAKE';
        }
        if (this.commit === 0 || unsafe) {
          this.state = 'FOLLOW';
          this.speedTarget = Math.min(this.speedTarget, Math.max(0, aheadSpeed + (gap - 9) * 0.7));
        }
        if (gap < 5 && Math.abs(ahead.lateral - this.lateral) < 2.2)
          this.speedTarget = Math.min(this.speedTarget, Math.max(0, aheadSpeed - 4));
        if (this.commit > 0 && Math.abs(this.offset - this.desiredOffset) > 1 && gap < 11) {
          this.state = 'PREPARE_OVERTAKE';
          this.speedTarget = Math.min(this.speedTarget, Math.max(6, aheadSpeed + 2));
        }
      } else if (this.commit === 0) {
        const alongside = nearby.find(
          (o) =>
            Math.abs(signedDistance(this.t!, o.t)) < 5 && Math.abs(o.lateral - this.lateral) < 2.6,
        );
        if (alongside) {
          desired = clamp(
            alongside.lateral + (this.lateral >= alongside.lateral ? 2.5 : -2.5),
            -3.2,
            3.2,
          );
          this.state = 'YIELD';
        } else {
          const behind = nearby.find(
            (o) => signedDistance(this.t!, o.t) < -7 && signedDistance(this.t!, o.t) > -20,
          );
          if (behind && !unsafe && curve < 0.02) {
            desired = clamp(this.rival.lane * 0.6, -0.5, 0.5);
            this.state = 'DEFEND';
          } else this.state = 'FOLLOW_LINE';
        }
        this.desiredOffset = desired + d.precision * Math.sin(this.clock * 0.4 + (this.seed % 9));
        if (this.random() < d.mistake * 0.03) this.desiredOffset += (this.random() - 0.5) * 0.5;
      }
      if (unsafe) {
        this.commit = 0;
        this.state = 'BYPASS';
        this.desiredOffset = 0;
      }
    }
    this.offset += clamp(
      routeOffset(this.t, this.desiredOffset) - this.offset,
      -dt * 1.5,
      dt * 1.5,
    );
    this.lookahead = 6 + speed * 0.38;
    const targetT = (this.t + this.lookahead / TRACK_LENGTH) % 1,
      target = navAt(targetT, routeOffset(targetT, this.offset));
    this.target.x = target.x;
    this.target.y = target.y;
    this.target.z = target.z;
    const desired = Math.atan2(-(target.x - input.x), -(target.z - input.z)),
      error = angle(desired - input.yaw);
    const steer = clamp(error * 3.6, -1, 1);
    this.steer += (steer - this.steer) * (1 - Math.exp(-dt * 10));
    if (Math.abs(error) > 0.7) this.speedTarget = Math.min(this.speedTarget, 8);
    if (projection.distance > 6) this.speedTarget = Math.min(this.speedTarget, 9);
    if (input.finished) {
      this.speedTarget = Math.min(this.speedTarget, 14);
      this.state = 'FINISHED';
    }
    if (speed > this.speedTarget + 1) this.throttleState = 'brake';
    else if (speed < this.speedTarget - 0.6) this.throttleState = 'throttle';
    else if (this.throttleState === 'brake' && speed < this.speedTarget + 0.1)
      this.throttleState = 'coast';
    else if (this.throttleState === 'throttle' && speed > this.speedTarget + 0.1)
      this.throttleState = 'coast';
    this.command.throttle = this.throttleState === 'throttle';
    this.command.brake = this.throttleState === 'brake';
    this.command.steer = this.steer;
    this.stuck =
      speed < 1.2 && !input.finished ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    this.recovery =
      (speed < 1.2 && this.speedTarget > 4) || Math.abs(error) > 1.6 || projection.distance > 8
        ? this.recovery + dt
        : Math.max(0, this.recovery - dt * 2);
    if (this.stuck > 2.5) {
      this.state = 'RECOVER';
      this.command.throttle = false;
      this.command.brake = true;
      this.command.steer = Math.sign(error || 1);
    }
    this.costMs = performance.now() - started;
    this.totalCostMs += this.costMs;
    this.updates++;
    return this.command;
  }
  get needsReset() {
    return (this.stuck > 6 || this.recovery > 10) && this.cooldown === 0;
  }
}
