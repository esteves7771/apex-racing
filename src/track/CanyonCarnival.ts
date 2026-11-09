import * as THREE from 'three';
import { createCanyonTerrain } from './CanyonTerrain';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const clamp = THREE.MathUtils.clamp,
  smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
export const TRACK_LAYOUT_ID = 'canyon-carnival-sprint-1';
export const TRACK_INFO = {
  name: 'Canyon Carnival',
  edition: 'Redline adventure',
  difficulty: 'Adventure',
  corners: 'Seven worlds · four route choices · one finish',
};
export const ROAD_WIDTH = 14,
  SEGMENTS = 2200;
// Authored sweeps, reversals and braking sequences. Open: never wraps end to start.
const anchors = [
  [0, 50],
  [0, -90],
  [80, -190],
  [160, -150],
  [220, -260],
  [120, -350],
  [40, -420],
  [100, -510],
  [240, -540],
  [310, -450],
  [390, -530],
  [350, -650],
  [240, -730],
  [310, -840],
  [460, -860],
  [530, -760],
  [610, -850],
  [570, -990],
  [440, -1060],
  [500, -1170],
  [650, -1200],
  [720, -1100],
  [810, -1200],
  [770, -1330],
  [640, -1410],
  [700, -1520],
  [850, -1540],
  [930, -1430],
  [1030, -1530],
  [980, -1660],
  [850, -1730],
  [910, -1850],
  [1050, -1880],
  [1130, -1780],
  [1220, -1880],
  [1170, -2010],
  [1030, -2080],
  [1100, -2200],
  [1250, -2210],
  [1340, -2100],
  [1440, -2200],
  [1390, -2330],
  [1260, -2400],
  [1320, -2520],
  [1450, -2560],
  [1510, -2670],
  [1510, -2790],
];
const raw = new THREE.CatmullRomCurve3(
  anchors.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal',
);
raw.arcLengthDivisions = 8000;
const scale = 5000 / raw.getLength();
export const curve = new THREE.CatmullRomCurve3(
  anchors.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
  false,
  'centripetal',
);
curve.arcLengthDivisions = 8000;
export const TRACK_LENGTH = curve.getLength();
const originalPoint = curve.getPointAt.bind(curve),
  originalTangent = curve.getTangentAt.bind(curve);
curve.getPointAt = (t: number, target = new THREE.Vector3()) => {
  const u = clamp(t, 0, 1);
  originalPoint(u, target);
  if (t !== u) target.addScaledVector(originalTangent(u), (t - u) * TRACK_LENGTH);
  return target;
};
curve.getTangentAt = (t: number, target = new THREE.Vector3()) =>
  originalTangent(clamp(t, 0, 1), target);
export const sections = [
  ['Festival Rush', 0, 0.12],
  ['Serpent Canyon', 0.12, 0.28],
  ['Rusty Mine Run', 0.28, 0.42],
  ['Emerald Oasis', 0.42, 0.58],
  ['Skybridge Heights', 0.58, 0.72],
  ['Avalanche Alley', 0.72, 0.88],
  ['Grand Finale', 0.88, 1],
].map(([name, start, end]) => ({
  name: name as string,
  start: start as number,
  end: end as number,
}));
export const sectionAt = (t: number) =>
  sections.find((s) => t >= s.start && t < s.end) ?? sections.at(t < 0 ? 0 : -1)!;
export const branches = [
  { id: 'cliff', start: 0.155, end: 0.245, offset: -38, height: 9, risk: 0.8 },
  { id: 'mine', start: 0.305, end: 0.385, offset: -32, height: 0, risk: 0.65 },
  { id: 'waterside', start: 0.455, end: 0.545, offset: -37, height: -7, risk: 0.35 },
  { id: 'switchbacks', start: 0.745, end: 0.845, offset: -24, height: 3, risk: 0.2 },
];
export const jumps = [
  {
    id: 'cliff-hop',
    t: 0.211,
    route: 'cliff',
    lateral: 0,
    height: 1.0,
    velocity: 2.8,
    minSpeed: 14,
  },
  {
    id: 'mine-crest',
    t: 0.354,
    route: 'mine',
    lateral: -2,
    height: 1.2,
    velocity: 3.2,
    minSpeed: 17,
  },
  {
    id: 'oasis-hop',
    t: 0.4905,
    route: 'main',
    lateral: -3,
    height: 1.4,
    velocity: 3.8,
    minSpeed: 18,
  },
  {
    id: 'eagles-leap',
    t: 0.696,
    route: 'main',
    lateral: -3,
    height: 1.8,
    velocity: 4,
    minSpeed: 22,
  },
  {
    id: 'alley-crest',
    t: 0.797,
    route: 'main',
    lateral: -3,
    height: 1.0,
    velocity: 3,
    minSpeed: 16,
  },
  {
    id: 'final-show',
    t: 0.954,
    route: 'main',
    lateral: -3,
    height: 1.5,
    velocity: 4,
    minSpeed: 20,
  },
];
export const boostPads = [
  { t: 0.025, route: 'main', lateral: -2 },
  { t: 0.073, route: 'main', lateral: 2 },
  { t: 0.19, route: 'cliff', lateral: 0 },
  { t: 0.327, route: 'mine', lateral: 0 },
  { t: 0.472, route: 'main', lateral: 2 },
  { t: 0.516, route: 'waterside', lateral: 0 },
  { t: 0.681, route: 'main', lateral: -3 },
  { t: 0.758, route: 'switchbacks', lateral: 0 },
  { t: 0.9, route: 'main', lateral: 2 },
  { t: 0.971, route: 'main', lateral: 0 },
].map((p, i) => ({ ...p, id: `boost-${i}`, width: 3.4, length: 9 }));
export const solidObstacles = [
  { t: 0.338, route: 'main', lateral: -3.8, radius: 1.1 },
  { t: 0.371, route: 'main', lateral: 4, radius: 1.2 },
  { t: 0.769, route: 'main', lateral: 3.5, radius: 1.2 },
  { t: 0.811, route: 'main', lateral: -3.5, radius: 1.1 },
].map((p, i) => ({ ...p, id: `solid-${i}` }));
export const breakables = Array.from({ length: 14 }, (_, i) => ({
  id: `crate-${i}`,
  t: (i < 7 ? 0.315 : 0.756) + (i % 7) * 0.006,
  route: 'main',
  lateral: i % 2 ? -3.8 : 3.8,
  radius: 0.65,
}));
export const tunnels = [
  { start: 0.188, end: 0.212, route: 'main', height: 8 },
  { start: 0.333, end: 0.357, route: 'mine', height: 8 },
];
export const tunnelAt = (t: number, route = 'main') =>
  tunnels.find((v) => v.route === route && t >= v.start && t <= v.end);
export const trackFeatures = {
  bank: { center: 0.63, halfLength: 0.04, radians: 0.06 },
  jump: {
    approach: 0.6896,
    crest: 0.696,
    end: 0.708,
    height: 1.8,
    laneCenter: -3,
    laneHalfWidth: 2.3,
    takeoffMinSpeed: 22,
    takeoffVelocity: 4,
  },
  landmarks: sections.map((s) => ({ t: s.start, name: s.name })),
};
export function bankAt(t: number) {
  return 0.055 * Math.sin(t * Math.PI * 28) * smooth(0.02, 0.04, t) * (1 - smooth(0.97, 0.99, t));
}
export function baseHeight(t: number) {
  return (
    8 +
    22 * smooth(0.12, 0.24, t) -
    15 * smooth(0.28, 0.4, t) -
    9 * smooth(0.43, 0.5, t) +
    47 * smooth(0.58, 0.68, t) -
    37 * smooth(0.72, 0.88, t) -
    8 * smooth(0.9, 0.99, t)
  );
}
export function roadWidthAt(t: number, route = 'main') {
  return route !== 'main'
    ? route === 'waterside' || route === 'switchbacks'
      ? 14
      : 10
    : 14 +
        3 * (1 - smooth(0.1, 0.13, t) + smooth(0.87, 0.9, t)) -
        smooth(0.27, 0.3, t) * (1 - smooth(0.4, 0.43, t));
}
export const widthAt = roadWidthAt;
function branchWeight(t: number, route: string) {
  const b = branches.find((b) => b.id === route);
  return b && t > b.start && t < b.end
    ? Math.sin((Math.PI * (t - b.start)) / (b.end - b.start)) ** 2
    : 0;
}
const branchCurves = new Map(
  branches.map((b) => {
    const fractions = [0, 0.06, 0.22, 0.4, 0.6, 0.78, 0.94, 1];
    const points = fractions.map((u) => {
      const t = THREE.MathUtils.lerp(b.start, b.end, u),
        p = curve.getPointAt(t),
        d = curve.getTangentAt(t);
      const offset = b.offset * Math.sin(Math.PI * u) ** 2;
      return p.add(new THREE.Vector3(-d.z * offset, 0, d.x * offset));
    });
    const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    path.arcLengthDivisions = 1500;
    return [b.id, path] as const;
  }),
);
const mainProjectionPoints = Array.from({ length: SEGMENTS + 1 }, (_, i) =>
  curve.getPointAt(i / SEGMENTS),
);
function projectMain(x: number, z: number, hint: number) {
  let best = Infinity,
    t = hint,
    lateral = 0;
  const center = Math.floor(hint * SEGMENTS);
  for (let k = Math.max(0, center - 70); k < Math.min(SEGMENTS, center + 70); k++) {
    const a = mainProjectionPoints[k],
      b = mainProjectionPoints[k + 1],
      dx = b.x - a.x,
      dz = b.z - a.z,
      u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1),
      px = a.x + u * dx,
      pz = a.z + u * dz,
      dist = (x - px) ** 2 + (z - pz) ** 2;
    if (dist < best) {
      best = dist;
      t = (k + u) / SEGMENTS;
      lateral = ((x - px) * -dz + (z - pz) * dx) / Math.hypot(dx, dz);
    }
  }
  return { t, lateral, distance: Math.sqrt(best) };
}
export function routePose(t: number, route = 'main', lateral = 0) {
  const b = branches.find((b) => b.id === route && t >= b.start && t <= b.end),
    path = b ? branchCurves.get(route) : undefined,
    u = b ? clamp((t - b.start) / (b.end - b.start), 0, 1) : t;
  const p = path ? path.getPointAt(u) : curve.getPointAt(t),
    direction = path ? path.getTangentAt(u) : curve.getTangentAt(t);
  p.add(new THREE.Vector3(-direction.z * lateral, 0, direction.x * lateral));
  const weight = branchWeight(t, route);
  p.y = baseHeight(t) + (b?.height ?? 0) * weight + Math.tan(bankAt(t)) * lateral;
  if (b && (u < 0.07 || u > 0.93)) {
    const main = projectMain(p.x, p.z, t),
      parent = baseHeight(main.t) + Math.tan(bankAt(main.t)) * main.lateral;
    const join = smooth(0, 0.07, Math.min(u, 1 - u));
    p.y = THREE.MathUtils.lerp(parent, p.y, join);
  }
  for (const j of jumps)
    if (j.route === route) {
      const along = (t - j.t) * TRACK_LENGTH,
        side = 1 - smooth(1.6, 2.4, Math.abs(lateral - j.lateral));
      const runup = j.id === 'eagles-leap' ? 32 : 18;
      if (along >= -runup && along <= 5)
        p.y += j.height * (along < 0 ? smooth(-runup, 0, along) : 1 - smooth(0, 5, along)) * side;
    }
  return { p, yaw: Math.atan2(-direction.x, -direction.z) };
}
export const poseAt = (t: number) => routePose(t);
export const roadHeight = (t: number, lateral = 0) => routePose(t, 'main', lateral).p.y + 0.035;
export const samples = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
  const t = i / SEGMENTS,
    p = curve.getPointAt(t),
    tangent = curve.getTangentAt(t);
  return { p, tangent, side: new THREE.Vector3(-tangent.z, 0, tangent.x), t };
});
const paths = ['main', ...branches.map((b) => b.id)].map((id) => {
  const b = branches.find((b) => b.id === id),
    start = b?.start ?? -0.012,
    end = b?.end ?? 1.05,
    count = Math.ceil((end - start) * SEGMENTS);
  return {
    id,
    start,
    end,
    count,
    points: Array.from(
      { length: count + 1 },
      (_, i) => routePose(start + ((end - start) * i) / count, id).p,
    ),
  };
});
export function projectRoute(x: number, z: number, previousT?: number, route?: string) {
  let best = Infinity,
    t = previousT ?? 0,
    lateral = 0,
    chosen = 'main',
    index = 0;
  for (const path of paths) {
    if (route && route !== path.id) continue;
    let lo = 0,
      hi = path.count;
    if (previousT !== undefined) {
      lo = Math.max(
        0,
        Math.floor(((previousT - path.start) / (path.end - path.start)) * path.count) - 28,
      );
      hi = Math.min(path.count, lo + 58);
    }
    for (let i = lo; i < hi; i++) {
      const a = path.points[i],
        b = path.points[i + 1],
        dx = b.x - a.x,
        dz = b.z - a.z,
        u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1),
        px = a.x + dx * u,
        pz = a.z + dz * u,
        dist = (x - px) ** 2 + (z - pz) ** 2;
      if (dist < best) {
        best = dist;
        t = path.start + ((path.end - path.start) * (i + u)) / path.count;
        lateral = ((x - px) * -dz + (z - pz) * dx) / Math.hypot(dx, dz);
        chosen = path.id;
        index = i;
      }
    }
  }
  return { t, lateral, distance: Math.sqrt(best), route: chosen, index };
}
/** Lock a physically entered branch until its merge; earned milestones separately cap official progress. */
export function projectProgress(x: number, z: number, previousT: number, route: string) {
  const current = projectRoute(x, z, previousT, route);
  const branch = branches.find((b) => b.id === route);
  if (branch && current.t < branch.end - 0.001) return current;
  if (branch) return projectRoute(x, z, previousT, 'main');
  const entering = branches.find(
    (b) => previousT >= b.start - 0.006 && previousT < b.start + 0.025,
  );
  if (entering) {
    const alt = projectRoute(x, z, previousT, entering.id);
    if (
      alt.distance < roadWidthAt(alt.t, entering.id) / 2 + 0.4 &&
      current.distance > roadWidthAt(current.t, 'main') / 2 + 0.5
    )
      return alt;
  }
  return current;
}
export const nearestTrack = (x: number, z: number) => projectRoute(x, z);
export const terrainHeight = (x: number, z: number) => terrainData.heightAt(x, z);
export function surfaceAt(x: number, z: number) {
  const n = nearestTrack(x, z);
  return {
    ...n,
    height:
      n.distance < roadWidthAt(n.t, n.route) / 2 + 0.6
        ? routePose(n.t, n.route, n.lateral).p.y + 0.035
        : terrainHeight(x, z),
  };
}
export const checkpoints = [0, 0.12, 0.28, 0.42, 0.58, 0.72, 0.88, 1].map((t) => ({
  ...poseAt(t),
  t,
  tangent: curve.getTangentAt(t),
}));
export function crossedGate(previous: THREE.Vector3, current: THREE.Vector3, index: number) {
  const c = checkpoints[index],
    a = previous.clone().sub(c.p).dot(c.tangent),
    b = current.clone().sub(c.p).dot(c.tangent);
  if (a >= 0 || b < 0) return false;
  const q = previous
    .clone()
    .lerp(current, -a / (b - a))
    .sub(c.p);
  return Math.abs(q.x * c.tangent.z - q.z * c.tangent.x) < 10 && Math.abs(q.y) < 8;
}
function pathRibbon(route: string, inner: number, outer: number, y: number) {
  const path = paths.find((p) => p.id === route)!,
    pos: number[] = [],
    idx: number[] = [],
    cols = Math.max(2, Math.ceil((outer - inner) / 0.5));
  for (let i = 0; i <= path.count; i++) {
    const t = path.start + ((path.end - path.start) * i) / path.count;
    for (let k = 0; k <= cols; k++) {
      const w =
        THREE.MathUtils.lerp(inner, outer, k / cols) *
        (route === 'main' && inner === -8.5 && outer === 8.5 ? roadWidthAt(t) / 17 : 1);
      const p = routePose(t, route, w).p;
      pos.push(p.x, p.y + y, p.z);
    }
    if (i < path.count)
      for (let k = 0; k < cols; k++) {
        if (route !== 'main') {
          const middle = routePose(
            t,
            route,
            THREE.MathUtils.lerp(inner, outer, (k + 0.5) / cols),
          ).p;
          const n = projectRoute(middle.x, middle.z, undefined, 'main');
          if (
            n.distance < roadWidthAt(n.t) / 2 - 0.05 &&
            Math.abs(middle.y - routePose(n.t, 'main', n.lateral).p.y) < 0.12
          )
            continue;
        }
        const a = i * (cols + 1) + k,
          b = a + cols + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function ribbon(inner: number, outer: number, y: number) {
  return pathRibbon('main', inner, outer, y);
}
export function terrainGeometry() {
  return terrainData.geometry.clone();
}
export const roadGeometries = paths.map((p) => {
  const width = p.id === 'main' ? 17 : roadWidthAt((p.start + p.end) / 2, p.id);
  return { route: p.id, geometry: pathRibbon(p.id, -width / 2, width / 2, 0.035) };
});
export const roadGeometry = mergeGeometries(roadGeometries.map((r) => r.geometry))!;
// Barrier centers are tested against every route envelope, including split and merge footprints.
export const barriers: { p: THREE.Vector3; yaw: number; length: number }[] = [];
for (const path of paths)
  for (let i = 0; i < path.count; i += 1) {
    const t = path.start + ((path.end - path.start) * i) / path.count,
      t2 = path.start + ((path.end - path.start) * Math.min(path.count, i + 1)) / path.count,
      width = roadWidthAt((t + t2) / 2, path.id);
    for (const side of [-1, 1]) {
      const a = routePose(t, path.id, side * (width / 2 + 0.45)).p,
        b = routePose(t2, path.id, side * (width / 2 + 0.45)).p,
        mid = a.clone().lerp(b, 0.5);
      let safe = true;
      for (const other of paths)
        if (other.id !== path.id) {
          for (const point of [a, mid, b]) {
            const n = projectRoute(point.x, point.z, undefined, other.id);
            if (
              n.distance < roadWidthAt(n.t, other.id) / 2 + 0.8 &&
              Math.abs(point.y - routePose(n.t, other.id, n.lateral).p.y) < 3
            ) {
              safe = false;
              break;
            }
          }
          if (!safe) break;
        }
      if (safe) {
        const d = b.clone().sub(a);
        barriers.push({ p: mid, yaw: Math.atan2(d.x, d.z), length: d.length() });
      }
    }
  }

const terrainData = createCanyonTerrain({ routePose, roadWidthAt, projectRoute, branches });

export const routeGraph = {
  nodes: [
    { id: 'start', t: 0 },
    ...branches.flatMap((b) => [
      { id: `${b.id}-split`, t: b.start },
      { id: `${b.id}-merge`, t: b.end },
    ]),
    { id: 'finish', t: 1 },
  ].sort((a, b) => a.t - b.t),
  alternatives: branches.map((b) => ({
    from: `${b.id}-split`,
    to: `${b.id}-merge`,
    route: b.id,
    start: b.start,
    end: b.end,
  })),
};
export const DRIVING_LENGTH = samples
  .slice(1)
  .reduce((sum, s, i) => sum + routePose(s.t).p.distanceTo(routePose(samples[i].t).p), 0);
