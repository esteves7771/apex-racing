import * as canyon from '../track/CanyonCarnival';
import { RacingAI, type Difficulty, type Rival, type Traffic } from './RacingAI';
import type { VehicleDefinition } from '../vehicle/VehicleRegistry';
import type { DriveCommand } from '../vehicle/VehicleDynamics';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const angle = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const N = 2000,
  step = canyon.TRACK_LENGTH / N;
interface LinePoint {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  offset: number;
  curvature: number;
  curvatureRate: number;
  crest: number;
  s: number;
}
const lines = new Map<string, LinePoint[]>();
/** Bounded open-course minimum-curvature line, solved once, outside the physics callback. */
function lineFor(route: string, car: VehicleDefinition, takeEagle = false) {
  const key = route + car.id + Number(takeEagle);
  let result = lines.get(key);
  if (result) return result;
  const poses = Array.from({ length: N + 1 }, (_, i) => canyon.routePose(i / N, route));
  let offsets = new Float64Array(N + 1),
    next = new Float64Array(N + 1);
  const branchWidth = canyon.roadWidthAt(
    canyon.branches.find((b) => b.id === route)?.start ?? 0.5,
    route,
  );
  const limit =
    route === 'main' || branchWidth >= 14
      ? car.id === 'vortex'
        ? 1.65
        : car.id === 'bolt'
          ? 2.7
          : 2.35
      : car.id === 'vortex'
        ? 1.2
        : car.id === 'bolt'
          ? 2.0
          : 1.8;
  const constraints = poses.map((_, i) => {
    const t = i / N;
    let weight = 0,
      offset = 0;
    for (const pad of canyon.boostPads)
      if (pad.route === route) {
        const distance = Math.abs(t - pad.t) * canyon.TRACK_LENGTH,
          w = 1 - clamp((distance - 12) / 58, 0, 1);
        if (w > weight) {
          weight = w;
          offset = pad.lateral;
        }
      }
    for (const jump of canyon.jumps)
      if (jump.route === route) {
        const distance = (t - jump.t) * canyon.TRACK_LENGTH,
          w =
            distance < 0
              ? clamp((distance + 90) / 55, 0, 1)
              : 1 - clamp((distance - 25) / 45, 0, 1);
        if (w > 0) {
          weight = w;
          offset =
            takeEagle && jump.id === 'eagles-leap' ? jump.lateral : jump.lateral < 0 ? 2.6 : -2.6;
        }
      }
    return { weight, offset };
  });
  for (let pass = 0; pass < 180; pass++) {
    for (let i = 1; i < N; i++) {
      const a = poses[i - 1],
        b = poses[i + 1],
        c = poses[i],
        oa = offsets[i - 1],
        ob = offsets[i + 1];
      const mx = (a.p.x + Math.cos(a.yaw) * oa + b.p.x + Math.cos(b.yaw) * ob) / 2,
        mz = (a.p.z - Math.sin(a.yaw) * oa + b.p.z - Math.sin(b.yaw) * ob) / 2;
      const proposed = clamp(
          offsets[i] * 0.45 +
            ((mx - c.p.x) * Math.cos(c.yaw) - (mz - c.p.z) * Math.sin(c.yaw)) * 0.55,
          -limit,
          limit,
        ),
        pin = constraints[i];
      next[i] = proposed * (1 - pin.weight) + pin.offset * pin.weight;
    }
    [offsets, next] = [next, offsets];
  }
  const points = poses.map((p, i) => {
    const q = canyon.routePose(i / N, route, offsets[i]).p;
    return {
      t: i / N,
      x: q.x,
      y: q.y,
      z: q.z,
      yaw: p.yaw,
      offset: offsets[i],
      curvature: 0,
      curvatureRate: 0,
      crest: 0,
      s: 0,
    };
  });
  for (let i = 0; i <= N; i++) {
    const a = points[Math.max(0, i - 2)],
      b = points[Math.min(N, i + 2)];
    points[i].yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    if (i)
      points[i].s =
        points[i - 1].s + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  for (let i = 0; i <= N; i++) {
    const a = points[Math.max(0, i - 2)],
      b = points[Math.min(N, i + 2)],
      p = points[i],
      distance = Math.max(1, b.s - a.s);
    p.curvature = angle(b.yaw - a.yaw) / distance;
    p.crest = i > 2 && i < N - 2 ? (b.y - 2 * p.y + a.y) / ((distance * distance) / 4) : 0;
  }
  for (let i = 0; i <= N; i++) {
    const a = points[Math.max(0, i - 2)],
      b = points[Math.min(N, i + 2)];
    points[i].curvatureRate = (b.curvature - a.curvature) / Math.max(1, b.s - a.s);
  }
  lines.set(key, points);
  return points;
}
function at(line: LinePoint[], t: number): LinePoint {
  const index = clamp(t, 0, 1) * N,
    i = Math.min(N - 1, Math.floor(index)),
    u = index - i,
    a = line[i],
    b = line[i + 1];
  return {
    t,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    yaw: a.yaw + angle(b.yaw - a.yaw) * u,
    offset: a.offset + (b.offset - a.offset) * u,
    curvature: a.curvature + (b.curvature - a.curvature) * u,
    curvatureRate: a.curvatureRate + (b.curvatureRate - a.curvatureRate) * u,
    crest: a.crest + (b.crest - a.crest) * u,
    s: a.s + (b.s - a.s) * u,
  };
}
function aheadT(line: LinePoint[], t: number, distance: number) {
  const s = at(line, t).s + distance;
  if (s >= line[N].s) return 1 + (s - line[N].s) / canyon.TRACK_LENGTH;
  let lo = Math.max(0, Math.floor(clamp(t, 0, 1) * N)),
    hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line[mid].s < s) lo = mid;
    else hi = mid;
  }
  return (lo + (s - line[lo].s) / Math.max(0.01, line[hi].s - line[lo].s)) / N;
}
const profiles = {
  rookie: { pace: 0.86, corner: 0.78, brake: 0.76, precision: 0.2 },
  club: { pace: 0.97, corner: 0.93, brake: 0.92, precision: 0.07 },
  pro: { pace: 1, corner: 1, brake: 0.99, precision: 0.015 },
};
export interface CanyonInput {
  x: number;
  y?: number;
  z: number;
  yaw: number;
  speed: number;
  grounded: boolean;
  lateralSpeed?: number;
  finished?: boolean;
  boostRemaining?: number;
}
export type CanyonTraffic = Traffic & { route?: string };
/** Same pedals, masses, grip, steering and boost state as the player; no racer position enters pace. */
export class CanyonAI extends RacingAI {
  route = 'main';
  usedRoutes: string[] = [];
  choices = new Map<string, string>();
  forcedRoute?: string;
  private line: LinePoint[];
  private takeEagle: boolean;
  private recoveryClock = 0;
  private passLane = 0;
  private finishedAt: number | null = null;
  constructor(car: VehicleDefinition, rival: Rival, difficulty: Difficulty = 'club', seed = 41) {
    super(car, rival, difficulty, seed);
    this.takeEagle = rival.id === 'rex' && difficulty === 'pro';
    this.line = lineFor('main', car, this.takeEagle);
    for (const branch of canyon.branches) lineFor(branch.id, car, this.takeEagle);
  }
  override reset(t: number) {
    this.t = t;
    this.route = 'main';
    this.usedRoutes = [];
    this.choices.clear();
    this.steer = 0;
    this.offset = 0;
    this.previousLineOffset = 0;
    this.desiredOffset = 0;
    this.clock = 0;
    this.stuck = 0;
    this.recovery = 0;
    this.backOut = 0;
    this.recoveryClock = 0;
    this.finishedAt = null;
    this.passingId = undefined;
    this.commit = 0;
    this.passLane = 0;
    this.decision = 0;
    this.state = 'GRID';
    this.line = lineFor('main', this.car, this.takeEagle);
  }
  private speedLimit(point: LinePoint, boosted = false, route = this.route) {
    const h = this.car.handling,
      d = profiles[this.difficulty],
      k = Math.abs(point.curvature);
    const authority = h.steering * 0.98 * d.corner,
      slip =
        (this.car.id === 'bolt' ? 3.7 : 2.8) *
        d.corner *
        (canyon.roadWidthAt(point.t, route) >= 12 ? 1 : 0.68);
    const jump = canyon.jumps.find(
      (j) =>
        j.route === route &&
        (point.t - j.t) * canyon.TRACK_LENGTH > -100 &&
        (point.t - j.t) * canyon.TRACK_LENGTH < 65,
    );
    const jumpLimit = jump
      ? this.difficulty === 'rookie'
        ? 25
        : jump.velocity >= 4.5
          ? 32
          : 35
      : Infinity;
    // Actual yaw-response lag requires reserve authority when curvature changes rapidly.
    const tau = -(1 / 60) / Math.log(1 - this.car.response),
      a = tau * Math.abs(point.curvatureRate),
      b = k + (authority * (h.steeringFalloff ?? 0.48)) / h.maxSpeed;
    const transientLimit =
      a > 0.000001
        ? (-b + Math.sqrt(b * b + 4 * a * authority)) / (2 * a)
        : authority / Math.max(0.0001, b);
    return Math.min(
      h.maxSpeed * d.pace * (boosted ? 1.2 : 1),
      jumpLimit,
      transientLimit,
      authority / (k + (authority * (h.steeringFalloff ?? 0.48)) / h.maxSpeed),
      Math.sqrt((h.grip * slip) / Math.max(0.0003, k)),
      point.crest < -0.001 ? Math.sqrt(7 / -point.crest) : Infinity,
    );
  }
  private routeCost(route: string, start: number, end: number) {
    const line = lineFor(route, this.car, this.takeEagle);
    let seconds = 0;
    for (let t = start; t < end; t += 0.002) {
      const a = at(line, t),
        b = at(line, t + 0.002);
      seconds += (b.s - a.s) / Math.max(8, this.speedLimit(a, false, route));
    }
    return seconds;
  }
  private chooseRoute(t: number) {
    for (const b of canyon.branches) {
      if (t >= b.start - 0.012 && t <= b.end + 0.001 && !this.choices.has(b.id)) {
        let chosen = 'main';
        if (this.forcedRoute === b.id) chosen = b.id;
        else if (this.forcedRoute === undefined && this.difficulty !== 'rookie') {
          const main = this.routeCost('main', b.start, b.end),
            branch = this.routeCost(b.id, b.start, b.end),
            riskCost =
              b.risk * (this.rival.id === 'rex' ? 0.2 : this.rival.id === 'milo' ? 3.5 : 1.2),
            preference = this.rival.id === 'rex' ? -0.9 : this.rival.id === 'nova' ? -0.2 : 0.5;
          if (
            branch + riskCost + preference < main * (this.difficulty === 'pro' ? 1.08 : 1.03) &&
            this.random() < (this.difficulty === 'pro' ? 1 : 0.75)
          )
            chosen = b.id;
        }
        this.choices.set(b.id, chosen);
        this.route = chosen;
        if (chosen !== 'main') this.usedRoutes.push(chosen);
        this.line = lineFor(this.route, this.car, this.takeEagle);
      }
      if (this.route === b.id && t >= b.end - 0.0002) {
        this.route = 'main';
        this.line = lineFor('main', this.car, this.takeEagle);
      }
    }
  }
  override update(input: CanyonInput, traffic: CanyonTraffic[] = [], dt = 1 / 60): DriveCommand {
    const started = performance.now();
    dt = clamp(dt, 0, 0.1);
    this.clock += dt;
    this.commit = Math.max(0, this.commit - dt);
    if (this.route === 'main' && !input.finished && input.grounded) {
      const actual = canyon.projectRoute(input.x, input.z, this.t),
        b = canyon.branches.find((b) => b.id === actual.route);
      if (
        b &&
        actual.t > b.start &&
        actual.t < b.end - 0.001 &&
        actual.distance < canyon.roadWidthAt(actual.t, b.id) / 2 - 0.7 &&
        Math.abs(actual.t - (this.t ?? actual.t)) < 0.025
      ) {
        const main = canyon.projectRoute(input.x, input.z, this.t, 'main'),
          height = canyon.routePose(actual.t, b.id, actual.lateral).p.y;
        if (
          main.distance > canyon.roadWidthAt(main.t) / 2 + 0.35 &&
          (input.y === undefined || Math.abs(input.y - height) < 1.3)
        ) {
          this.route = b.id;
          this.t = actual.t;
          this.choices.set(b.id, b.id);
          if (!this.usedRoutes.includes(b.id)) this.usedRoutes.push(b.id);
          this.line = lineFor(b.id, this.car, this.takeEagle);
        }
      }
    }
    this.chooseRoute(this.t ?? 0);
    let selected = canyon.branches.find((b) => b.id === this.route);
    let projection = canyon.projectRoute(
      input.x,
      input.z,
      this.t,
      selected && (this.t ?? 0) < selected.start ? 'main' : this.route,
    );
    const branch = canyon.branches.find((b) => b.id === this.route);
    this.t = projection.t;
    this.lateral = projection.lateral;
    this.chooseRoute(this.t);
    const speed = Math.abs(input.speed),
      profile = profiles[this.difficulty],
      point = at(this.line, this.t),
      boosted = (input.boostRemaining ?? 0) > 0;
    const previewCurvature = Math.max(
      Math.abs(point.curvature),
      Math.abs(at(this.line, aheadT(this.line, this.t, 8)).curvature),
      Math.abs(at(this.line, aheadT(this.line, this.t, 18)).curvature),
    );
    this.lookahead = Math.min(
      6.5 + speed * 0.34,
      Math.max(5.2, 0.45 / Math.max(0.001, previewCurvature)),
    );
    let nominal =
      point.offset +
      this.rival.lane * 0.22 +
      Math.sin(this.clock * 0.35 + this.seed) * profile.precision;
    const upcomingPad = canyon.boostPads.find(
      (p) =>
        p.route === this.route &&
        (p.t - this.t!) * canyon.TRACK_LENGTH > -4 &&
        (p.t - this.t!) * canyon.TRACK_LENGTH < 48,
    );
    const jump = canyon.jumps.find(
      (j) =>
        j.route === this.route &&
        (j.t - this.t!) * canyon.TRACK_LENGTH > -70 &&
        (j.t - this.t!) * canyon.TRACK_LENGTH < 125,
    );
    this.speedTarget = this.speedLimit(point, boosted);
    // Genuine forward braking envelope, using route arc distance rather than wrapped circuit progress.
    const decel = this.car.handling.braking * profile.brake * this.rival.braking;
    for (let distance = 5; distance <= 155; distance += 5) {
      const p = at(this.line, aheadT(this.line, this.t, distance)),
        v = this.speedLimit(p, boosted && distance < speed * (input.boostRemaining ?? 0));
      this.speedTarget = Math.min(
        this.speedTarget,
        Math.sqrt(
          v * v + 2 * decel * Math.max(0, distance - (this.difficulty === 'rookie' ? 8 : 3)),
        ),
      );
    }
    const width = canyon.roadWidthAt(this.t, this.route),
      limit = Math.min(
        this.car.id === 'vortex' ? 2.6 : this.car.id === 'sprinter' ? 3.0 : 3.5,
        width / 2 - 1.4,
      );
    this.state = upcomingPad
      ? 'TARGET_BOOST'
      : jump
        ? 'JUMP_APPROACH'
        : this.route === 'main'
          ? 'RACING_LINE'
          : 'BRANCH';
    const obstacle = canyon.solidObstacles.find(
      (o) =>
        o.route === this.route &&
        (o.t - this.t!) * canyon.TRACK_LENGTH > 0 &&
        (o.t - this.t!) * canyon.TRACK_LENGTH < Math.max(55, speed * 2),
    );
    if (obstacle) {
      const clearance = obstacle.radius + 1.7;
      if (Math.abs(nominal - obstacle.lateral) < clearance)
        nominal = clamp(
          obstacle.lateral > 0 ? obstacle.lateral - clearance : obstacle.lateral + clearance,
          -limit,
          limit,
        );
      this.state = 'AVOID_DEBRIS';
    }
    const nearby = traffic.filter(
        (o) =>
          o.id !== this.rival.id &&
          Math.hypot(o.x - input.x, o.z - input.z) < 75 &&
          (!o.route || o.route === this.route || Math.hypot(o.x - input.x, o.z - input.z) < 12),
      ),
      ahead = nearby
        .filter(
          (o) =>
            (o.t - this.t!) * canyon.TRACK_LENGTH > 0 &&
            (o.t - this.t!) * canyon.TRACK_LENGTH < 55 &&
            Math.abs(o.lateral - this.lateral) < 2.5,
        )
        .sort((a, b) => a.t - b.t)[0];
    const junction = canyon.branches.some((b) => {
      const entry = (b.start - this.t!) * canyon.TRACK_LENGTH,
        exit = (b.end - this.t!) * canyon.TRACK_LENGTH;
      return (entry < 140 && entry > -125) || (exit < 110 && exit > -60);
    });
    if (ahead) {
      const gap = (ahead.t - this.t) * canyon.TRACK_LENGTH;
      const passSafe =
        !jump &&
        !junction &&
        !branch &&
        width >= 14 &&
        Math.max(
          Math.abs(point.curvature),
          Math.abs(at(this.line, aheadT(this.line, this.t, 35)).curvature),
          Math.abs(at(this.line, aheadT(this.line, this.t, 65)).curvature),
        ) < (this.car.id === 'vortex' ? 0.016 : 0.022) &&
        this.difficulty !== 'rookie';
      let passed = this.passingId === ahead.id && this.commit > 0;
      if (
        passSafe &&
        !this.passingId &&
        gap < 35 &&
        (this.speedTarget > ahead.speed + 1.5 || ahead.speed < 1.2)
      )
        for (const sign of [this.rival.pass, -this.rival.pass]) {
          const lane = sign * Math.min(3.2, limit),
            clear =
              Math.abs(lane - ahead.lateral) > 2.4 &&
              !nearby.some(
                (o) =>
                  Math.abs((o.t - this.t!) * canyon.TRACK_LENGTH) < 20 &&
                  Math.abs(o.lateral - lane) < 2.4,
              );
          if (clear) {
            nominal = lane;
            this.state = 'OVERTAKE';
            this.passingId = ahead.id;
            this.commit = 5 * this.rival.patience;
            this.passLane = lane;
            passed = true;
            break;
          }
        }
      if (!passed || (gap < 9 && Math.abs(this.lateral - ahead.lateral) < 2.3)) {
        this.speedTarget = Math.min(this.speedTarget, Math.max(0, ahead.speed + (gap - 8) * 0.65));
        this.state = 'YIELD_TRAFFIC';
      }
    }
    const passing = nearby.find((o) => o.id === this.passingId);
    if (this.passingId && (!passing || (passing.t - this.t) * canyon.TRACK_LENGTH < -9))
      this.passingId = undefined;
    else if (passing) {
      const gap = (passing.t - this.t) * canyon.TRACK_LENGTH,
        abort = junction || !!jump || this.commit === 0;
      if (abort && gap > 0) {
        this.speedTarget = Math.min(
          this.speedTarget,
          Math.max(0, passing.speed + (gap - 12) * 0.4),
        );
        this.state = 'ABORT_PASS';
        if (gap >= 9) {
          this.passingId = undefined;
          this.commit = 0;
        } else nominal = this.passLane;
      } else {
        // Once our nose is ahead, keep the corridor until the rear clears. Braking
        // to let a following car pass would make both drivers yield to each other.
        nominal = this.passLane;
        this.state = abort ? 'CLEAR_PASS' : 'OVERTAKE';
      }
    }
    // At a merge, a physical nearby car wins priority over an optimistic branch racing line.
    if (branch && this.t > branch.end - 0.009) {
      const merge = canyon.routePose(branch.end).p;
      if (
        nearby.some(
          (o) =>
            o.route !== this.route &&
            Math.hypot(o.x - merge.x, o.z - merge.z) < 10 &&
            (o.t - this.t!) * canyon.TRACK_LENGTH > 0,
        )
      ) {
        this.speedTarget = Math.min(this.speedTarget, 10);
        this.state = 'MERGE_YIELD';
      }
    }
    const followsLine = !this.passingId && Math.abs(nominal - point.offset) < 0.4;
    // A passing/avoidance lane changes radius. Brake for that actual trajectory, not the nominal line.
    if (Math.abs(nominal - point.offset) > 0.25) {
      for (const distance of [0, 15, 35, 60]) {
        const t = aheadT(this.line, this.t, distance),
          ts = [-6, 0, 6].map((d) => aheadT(this.line, t, d));
        const ps = ts.map(
            (u) =>
              canyon.routePose(
                u,
                this.route,
                clamp(
                  nominal + (followsLine ? at(this.line, u).offset - point.offset : 0),
                  -limit,
                  limit,
                ),
              ).p,
          ),
          [a, b, c] = ps;
        const ab = Math.hypot(b.x - a.x, b.z - a.z),
          bc = Math.hypot(c.x - b.x, c.z - b.z),
          ac = Math.hypot(c.x - a.x, c.z - a.z),
          curvature =
            (2 * ((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x))) /
            Math.max(0.1, ab * bc * ac);
        const v = this.speedLimit(
          { ...at(this.line, t), curvature },
          boosted && distance < speed * (input.boostRemaining ?? 0),
        );
        this.speedTarget = Math.min(
          this.speedTarget,
          Math.sqrt(v * v + 2 * decel * Math.max(0, distance - 3)),
        );
      }
    }
    nominal = clamp(nominal, -limit, limit);
    this.desiredOffset = nominal;
    // Follow the moving line immediately, smooth only a traffic/pad displacement from it.
    if (followsLine) this.offset += point.offset - this.previousLineOffset;
    this.offset += clamp(nominal - this.offset, -dt * 5, dt * 5);
    this.previousLineOffset = point.offset;
    const targetT = input.finished
        ? this.t + this.lookahead / canyon.TRACK_LENGTH
        : aheadT(this.line, this.t, this.lookahead),
      lineTarget = at(this.line, targetT),
      nominalDelta = lineTarget.offset - point.offset;
    const target = canyon.routePose(
      targetT,
      this.route,
      clamp(this.offset + (followsLine ? nominalDelta : 0), -limit, limit),
    );
    this.target.x = target.p.x;
    this.target.y = target.p.y;
    this.target.z = target.p.z;
    const targetDistance = Math.max(4, Math.hypot(target.p.x - input.x, target.p.z - input.z)),
      error = angle(
        Math.atan2(-(target.p.x - input.x), -(target.p.z - input.z)) -
          input.yaw +
          Math.atan2(input.lateralSpeed ?? 0, Math.max(8, speed)) *
            (this.car.id === 'vortex' ? 0.35 : 0.8),
      ),
      authority =
        this.car.handling.steering *
        (1 -
          (this.car.handling.steeringFalloff ?? 0.48) *
            Math.min(1, speed / this.car.handling.maxSpeed));
    const desired = clamp(
      Math.sin(error) * Math.max(2.4, (2 * speed) / (targetDistance * authority)),
      -1,
      1,
    );
    this.steer += (desired - this.steer) * (1 - Math.exp(-dt * 11));
    if (Math.abs(error) > 0.7) this.speedTarget = Math.min(this.speedTarget, 9);
    if (projection.distance > width / 2 - 1) this.speedTarget = Math.min(this.speedTarget, 8);
    if (input.finished) {
      if (this.finishedAt === null) this.finishedAt = this.clock;
      this.speedTarget = Math.min(
        this.speedTarget,
        Math.max(0, 13 - (this.clock - this.finishedAt) * 2.8),
      );
      this.state = 'FINISHED';
    }
    if (speed > this.speedTarget + 0.65) this.throttleState = 'brake';
    else if (speed < this.speedTarget - 0.3) this.throttleState = 'throttle';
    else if (this.throttleState === 'brake' && speed < this.speedTarget + 0.05)
      this.throttleState = 'coast';
    else if (this.throttleState === 'throttle' && speed > this.speedTarget + 0.35)
      this.throttleState = 'coast';
    this.command.throttle = this.throttleState === 'throttle';
    this.command.brake = this.throttleState === 'brake' && input.speed > 0.8;
    this.command.steer = this.steer;
    this.command.drift = false;
    const rearBlocked = nearby.some((o) => {
      const dx = o.x - input.x,
        dz = o.z - input.z,
        along = -dx * Math.sin(input.yaw) - dz * Math.cos(input.yaw),
        side = dx * Math.cos(input.yaw) - dz * Math.sin(input.yaw);
      return along < 0 && along > -9 && Math.abs(side) < 2.6;
    });
    this.stuck =
      !input.finished && speed < 0.7 ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 2.2 && !rearBlocked && this.recoveryClock <= 0) {
      this.recoveryClock = 1.05;
      this.stuck = 0;
      this.recovery++;
    }
    if (this.recoveryClock > 0) {
      this.recoveryClock = Math.max(0, this.recoveryClock - dt);
      this.state = 'PHYSICAL_BACKOUT';
      this.command.throttle = input.speed < -2.5;
      this.command.brake = !this.command.throttle;
      this.command.steer = -Math.sign(error || 1);
    }
    if (input.speed < -0.5 && this.recoveryClock === 0) {
      this.command.throttle = true;
      this.command.brake = false;
    }
    this.costMs = performance.now() - started;
    this.totalCostMs += this.costMs;
    this.updates++;
    return this.command;
  }
  override get needsReset() {
    return false;
  }
}
