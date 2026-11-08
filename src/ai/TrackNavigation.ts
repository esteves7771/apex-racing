import { onTrackChange, trackId, trackFeatures } from '../track/ActiveTrack';
import { samples, TRACK_LENGTH, roadHeight, checkpoints, curve } from '../track/ActiveTrack';
export const wrap = (t: number) => ((t % 1) + 1) % 1;
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const signedDistance = (a: number, b: number) =>
  (angle((b - a) * Math.PI * 2) / (Math.PI * 2)) * TRACK_LENGTH;
let n = samples.length;
function buildNavigation() {
  n = samples.length;
  const step = TRACK_LENGTH / n;
  const result = samples.map((s, i) => {
    const before = samples[(i + n - 2) % n].tangent,
      after = samples[(i + 2) % n].tangent;
    const curvature =
      angle(Math.atan2(-after.x, -after.z) - Math.atan2(-before.x, -before.z)) / (4 * step);
    return {
      x: s.p.x,
      z: s.p.z,
      y: roadHeight(s.t),
      dx: s.tangent.x,
      dz: s.tangent.z,
      yaw: Math.atan2(-s.tangent.x, -s.tangent.z),
      t: s.t,
      s: i * step,
      curvature,
      width: 12,
      safeLimit: 3.5,
      jump:
        trackId === 'pine'
          ? s.t > 0.55 && s.t < 0.68
          : s.t > trackFeatures.jump.approach - 0.018 && s.t < trackFeatures.jump.end + 0.015,
      bypass: 3,
      checkpoint: Math.floor(s.t * checkpoints.length),
      brakingZone: false,
      recommendedSpeed: Math.sqrt(6 / Math.max(0.004, Math.abs(curvature))),
    };
  });
  for (let i = 0; i < n; i++)
    result[i].brakingZone = Array.from(
      { length: 30 },
      (_, k) => result[(i + k + 1) % n].recommendedSpeed,
    ).some((v) => v < result[i].recommendedSpeed * 0.72);
  return result;
}
export let navigation = buildNavigation();
onTrackChange(() => {
  navigation = buildNavigation();
});
export function navAt(t: number, offset = 0) {
  const index = wrap(t) * n,
    i = Math.floor(index),
    u = index - i,
    a = navigation[i],
    b = navigation[(i + 1) % n];
  const dx = a.dx + (b.dx - a.dx) * u,
    dz = a.dz + (b.dz - a.dz) * u;
  return {
    x: a.x + (b.x - a.x) * u - dz * offset,
    z: a.z + (b.z - a.z) * u + dx * offset,
    y: a.y + (b.y - a.y) * u,
    dx,
    dz,
    yaw: a.yaw + angle(b.yaw - a.yaw) * u,
    curvature: a.curvature + (b.curvature - a.curvature) * u,
    t: wrap(t),
  };
}
// Local projection cannot jump to a nearby, unearned part of the loop.
export function projectTrack(x: number, z: number, previous?: number) {
  let best = Infinity,
    t = previous ?? 0,
    lateral = 0;
  const center = previous === undefined ? 0 : Math.floor(wrap(previous) * n),
    radius = previous === undefined ? n : 24;
  for (
    let k = previous === undefined ? 0 : -radius;
    k < (previous === undefined ? n : radius + 1);
    k++
  ) {
    const i = (center + k + n) % n,
      a = navigation[i],
      b = navigation[(i + 1) % n],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1),
      px = a.x + dx * u,
      pz = a.z + dz * u,
      d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) {
      best = d;
      t = wrap((i + u) / n);
      const tangent = navAt(t);
      lateral = (x - px) * -tangent.dz + (z - pz) * tangent.dx;
    }
  }
  return { t, lateral, distance: Math.sqrt(best) };
}
export function routeOffset(t: number, desired: number, jump = false) {
  const smooth = (x: number) => {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const weight =
    trackId === 'pine'
      ? smooth((t - 0.54) / 0.035) * (1 - smooth((t - 0.65) / 0.035))
      : smooth((t - (trackFeatures.jump.approach - 0.018)) / 0.012) *
        (1 - smooth((t - trackFeatures.jump.end) / 0.012));
  return desired * (1 - weight) + (jump ? trackFeatures.jump.laneCenter : 3) * weight;
}
