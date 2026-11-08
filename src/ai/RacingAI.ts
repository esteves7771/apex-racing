import { navAt, projectTrack, routeOffset, clamp, angle, signedDistance } from './TrackNavigation';
import { TRACK_LENGTH, unsafeRoute, trackId, roadHeight } from '../track/ActiveTrack';
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
    at = navAt(t),
    k = Math.abs(at.curvature);
  const rise = (navAt(t + 6 / TRACK_LENGTH).y - 2 * at.y + navAt(t - 6 / TRACK_LENGTH).y) / 36;
  const crestLimit = rise < -0.001 ? Math.sqrt(7 / -rise) : Infinity;
  // Available yaw authority as well as lateral grip limits the arcade turning radius.
  const authority = car.handling.steering * 0.98 * d.corner;
  // grip is lateral velocity damping (1/s), not a lateral acceleration ceiling.
  // Limit equilibrium slip v^2*k/grip by difficulty; yaw authority remains a hard cap.
  const slipBudget =
    difficulty === 'pro'
      ? trackId === 'pine'
        ? 1.85
        : 2.1
      : difficulty === 'club'
        ? trackId === 'pine'
          ? 1.6
          : 1.75
        : 1.05;
  return Math.min(
    car.handling.maxSpeed * d.pace,
    crestLimit,
    authority / (k + (authority * (car.handling.steeringFalloff ?? 0.48)) / car.handling.maxSpeed),
    Math.sqrt((car.handling.grip * slipBudget * d.corner) / Math.max(k, 0.001)),
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
  for (let distance = 4; distance <= 140; distance += 4) {
    const ahead = (t + distance / TRACK_LENGTH) % 1,
      v = cornerSpeed(ahead, car, difficulty);
    limit = Math.min(
      limit,
      Math.sqrt(
        v * v +
          2 *
            decel *
            Math.max(0, distance - (difficulty === 'pro' ? 2 : difficulty === 'club' ? 4 : 7)),
      ),
    );
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
  passingId?: string;
  stuck = 0;
  recovery = 0;
  belowRoad = 0;
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
    this.passingId = undefined;
    this.stuck = 0;
    this.recovery = 0;
    this.belowRoad = 0;
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
      y?: number;
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
    this.belowRoad =
      input.y !== undefined && input.y < roadHeight(this.t, this.lateral) - 3
        ? this.belowRoad + dt
        : 0;
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
        curve = Math.abs(navAt(this.t + 35 / TRACK_LENGTH).curvature);
      const nearby = traffic.filter(
        (o) => o.id !== this.rival.id && Math.hypot(input.x - o.x, input.z - o.z) < 85,
      );
      const currentCurve = navAt(this.t).curvature,
        comingCurve = navAt(this.t + 35 / TRACK_LENGTH).curvature;
      let desired =
        this.rival.lane +
        clamp(
          (comingCurve - currentCurve * 1.5) *
            (this.difficulty === 'pro' ? 70 : this.difficulty === 'club' ? 50 : 15),
          -1.1,
          1.1,
        );
      const passing = nearby.find((o) => o.id === this.passingId);
      if (this.commit > 0 && (!passing || signedDistance(this.t, passing.t) < -8)) {
        this.commit = 0;
        this.passingId = undefined;
      }
      let yielded = false;
      if (
        this.commit > 0 &&
        nearby.some(
          (o) =>
            o.id !== this.passingId &&
            signedDistance(this.t!, o.t) > -8 &&
            signedDistance(this.t!, o.t) < 35 &&
            Math.abs(o.lateral - this.desiredOffset) < 2.2,
        )
      ) {
        this.commit = 0;
        this.passingId = undefined;
        this.desiredOffset = this.offset;
        this.state = 'YIELD';
        yielded = true;
      }
      const ahead = nearby
        .filter((o) => {
          const gap = signedDistance(this.t!, o.t);
          return gap > 0 && gap < 62 && Math.abs(o.lateral - this.lateral) < 2.6;
        })
        .sort((a, b) => signedDistance(this.t!, a.t) - signedDistance(this.t!, b.t))[0];
      if (ahead) {
        const gap = signedDistance(this.t, ahead.t),
          aheadSpeed =
            ahead.yaw !== undefined && Math.cos(ahead.yaw - navAt(ahead.t).yaw) < 0
              ? 0
              : Math.max(0, ahead.speed);
        if (
          !unsafe &&
          !yielded &&
          this.commit === 0 &&
          curve < 0.026 &&
          gap > 5 &&
          (this.speedTarget > aheadSpeed + 1 || aheadSpeed < 1.2)
        ) {
          for (const side of [this.rival.pass, -this.rival.pass]) {
            const lane = side * 2.9;
            const clear =
              Math.abs(lane - ahead.lateral) > 2.4 &&
              !nearby.some((o) => {
                const delta = signedDistance(this.t!, o.t);
                return delta > -10 && delta < 55 && Math.abs(o.lateral - lane) < 2.4;
              });
            if (clear && this.random() < d.confidence) {
              this.desiredOffset = lane;
              this.passingId = ahead.id;
              this.commit = 4 * this.rival.patience;
              this.state = 'OVERTAKE';
              break;
            }
          }
        }
        if (this.commit === 0 || unsafe) {
          this.state = yielded ? 'YIELD' : 'FOLLOW';
          this.speedTarget = Math.min(this.speedTarget, Math.max(0, aheadSpeed + (gap - 8) * 0.75));
        } else {
          this.state = 'OVERTAKE';
          if (Math.abs(ahead.lateral - this.lateral) < 2.5) {
            this.speedTarget = Math.min(
              this.speedTarget,
              Math.max(0, aheadSpeed + (gap - 7) / 1.6),
            );
            if (gap < Math.max(14, speed * 0.8)) this.state = 'PREPARE_OVERTAKE';
          }
        }
        if (gap < 5 && Math.abs(ahead.lateral - this.lateral) < 2.2)
          this.speedTarget = Math.min(this.speedTarget, Math.max(0, aheadSpeed - 4));
      } else if (this.commit === 0 && !yielded) {
        const side = nearby.find(
          (o) =>
            Math.abs(signedDistance(this.t!, o.t)) < 5 && Math.abs(o.lateral - this.lateral) < 2.4,
        );
        if (side) {
          desired = clamp(this.lateral + (this.lateral >= side.lateral ? 1.5 : -1.5), -3.2, 3.2);
          this.state = 'YIELD';
        } else {
          this.state =
            nearby.some(
              (o) => signedDistance(this.t!, o.t) < -7 && signedDistance(this.t!, o.t) > -20,
            ) &&
            !unsafe &&
            curve < 0.02
              ? 'DEFEND'
              : 'FOLLOW_LINE';
        }
      }
      if (this.commit === 0 && !yielded)
        this.desiredOffset = desired + d.precision * Math.sin(this.clock * 0.4 + (this.seed % 9));
      if (unsafe) {
        this.commit = 0;
        this.passingId = undefined;
        this.state = 'BYPASS';
        this.desiredOffset = 0;
      }
    }
    this.offset += clamp(
      routeOffset(this.t, this.desiredOffset) - this.offset,
      -dt * 2.2,
      dt * 2.2,
    );
    this.lookahead = 6 + speed * 0.38;
    const targetT = (this.t + this.lookahead / TRACK_LENGTH) % 1,
      target = navAt(targetT, routeOffset(targetT, this.offset));
    this.target.x = target.x;
    this.target.y = target.y;
    this.target.z = target.z;
    const desired = Math.atan2(-(target.x - input.x), -(target.z - input.z)),
      error = angle(desired - input.yaw);
    const yawAuthority =
      this.car.handling.steering *
      (1 -
        (this.car.handling.steeringFalloff ?? 0.48) *
          Math.min(1, speed / this.car.handling.maxSpeed));
    const pursuitGain = Math.max(3.6, (2 * speed) / (this.lookahead * yawAuthority));
    const steer = clamp(error * pursuitGain, -1, 1);
    this.steer += (steer - this.steer) * (1 - Math.exp(-dt * 10));
    if (Math.abs(error) > 0.7) this.speedTarget = Math.min(this.speedTarget, 8);
    if (projection.distance > 6) this.speedTarget = Math.min(this.speedTarget, 9);
    if (input.finished) {
      this.speedTarget = Math.min(this.speedTarget, 14);
      this.state = 'FINISHED';
    }
    if (speed > this.speedTarget + 0.8) this.throttleState = 'brake';
    else if (speed < this.speedTarget - 0.3) this.throttleState = 'throttle';
    else if (this.throttleState === 'brake' && speed < this.speedTarget + 0.1)
      this.throttleState = 'coast';
    else if (this.throttleState === 'throttle' && speed > this.speedTarget + 0.45)
      this.throttleState = 'coast';
    this.command.throttle = this.throttleState === 'throttle';
    // The shared brake pedal reverses below walking speed. Only explicit recovery may reverse.
    this.command.brake = this.throttleState === 'brake' && input.speed > 0.8;
    if (input.speed < -0.5) {
      this.command.throttle = true;
      this.command.brake = false;
    }
    this.command.steer = this.steer;
    this.stuck =
      speed < 0.35 && !input.finished ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
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
    return (this.stuck > 6 || this.recovery > 10 || this.belowRoad > 1) && this.cooldown === 0;
  }
}
