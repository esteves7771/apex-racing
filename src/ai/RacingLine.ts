import type { VehicleDefinition } from '../vehicle/VehicleRegistry';
import { navigation, navAt, routeOffset, clamp, angle, wrap } from './TrackNavigation';
import { onTrackChange, TRACK_LENGTH, unsafeRoute } from '../track/ActiveTrack';
import type { Difficulty } from './RacingAI';
const cache = new Map<string, ReturnType<typeof buildLine>>();
onTrackChange(() => cache.clear());
/** Bounded minimum-curvature trajectory. Solved at circuit selection, never in the driving loop. */
function buildLine(car?: VehicleDefinition) {
  const n = navigation.length,
    limit = car?.id === 'vortex' ? 1.7 : car?.id === 'sprinter' ? 2.5 : 3.0;
  let offsets = new Float64Array(n),
    next = new Float64Array(n);
  for (let pass = 0; pass < 240; pass++) {
    for (let i = 0; i < n; i++) {
      const a = navigation[(i + n - 1) % n],
        b = navigation[(i + 1) % n],
        c = navigation[i];
      const oa = offsets[(i + n - 1) % n],
        ob = offsets[(i + 1) % n];
      const mx = (a.x - a.dz * oa + b.x - b.dz * ob) * 0.5,
        mz = (a.z + a.dx * oa + b.z + b.dx * ob) * 0.5;
      next[i] = unsafeRoute(c.t)
        ? routeOffset(c.t, 0)
        : clamp(offsets[i] * 0.45 + ((mx - c.x) * -c.dz + (mz - c.z) * c.dx) * 0.55, -limit, limit);
    }
    [offsets, next] = [next, offsets];
  }
  const positions = navigation.map((p, i) => navAt(p.t, routeOffset(p.t, offsets[i])));
  const points = positions.map((p, i) => {
    const a = positions[(i + n - 2) % n],
      b = positions[(i + 2) % n];
    return {
      ...p,
      offset: routeOffset(p.t, offsets[i]),
      yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
    };
  });
  return points.map((p, i) => {
    const a = points[(i + n - 2) % n],
      b = points[(i + 2) % n];
    return {
      ...p,
      curvature: angle(b.yaw - a.yaw) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z)),
    };
  });
}
export function racingLineAt(t: number, difficulty: Difficulty, car?: VehicleDefinition) {
  const key = car?.id ?? 'bolt';
  let line = cache.get(key);
  if (!line) {
    line = buildLine(car);
    cache.set(key, line);
  }
  const index = wrap(t) * line.length,
    i = Math.floor(index),
    u = index - i,
    a = line[i],
    b = line[(i + 1) % line.length];
  return {
    offset: a.offset + (b.offset - a.offset) * u,
    curvature: a.curvature + (b.curvature - a.curvature) * u,
    yaw: a.yaw + angle(b.yaw - a.yaw) * u,
  };
}
