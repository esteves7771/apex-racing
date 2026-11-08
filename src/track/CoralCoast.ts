import * as THREE from 'three';
import { smoothstep } from './TrackFeatures';
export const TRACK_LAYOUT_ID = 'coral-coast-rush-1';
export const TRACK_INFO = {
  name: 'Coral Coast Rush',
  edition: 'Island adventure',
  difficulty: 'Technical',
  corners: 'Cliff hairpins · cavern sweeps · jungle rhythm',
};
export const ROAD_WIDTH = 12;
// Original island outline: long sightlines alternate with linked corner sequences.
const anchors = [
  [0, 180],
  [0, 60],
  [-40, -20],
  [-100, -90],
  [-95, -180],
  [-20, -200],
  [25, -270],
  [-45, -330],
  [-35, -410],
  [75, -440],
  [150, -390],
  [205, -445],
  [295, -430],
  [335, -345],
  [300, -255],
  [355, -195],
  [455, -190],
  [500, -100],
  [435, -30],
  [490, 50],
  [440, 130],
  [360, 110],
  [305, 185],
  [235, 150],
  [175, 235],
  [100, 260],
  [75, 350],
  [-15, 365],
  [-40, 365],
  [0, 310],
  [0, 250],
];
export const curve = new THREE.CatmullRomCurve3(
  anchors.map(([x, z]) => new THREE.Vector3(x * 1.32, 0, z * 1.32)),
  true,
  'centripetal',
);
curve.arcLengthDivisions = 4000;
export const TRACK_LENGTH = curve.getLength();
export const SEGMENTS = 1800;
const leapT = Array.from({ length: 4000 }, (_, i) => ({
  t: i / 4000,
  d: curve.getPointAt(i / 4000).distanceToSquared(new THREE.Vector3(528, 0, -257)),
})).reduce((a, b) => (a.d < b.d ? a : b)).t;
export const trackFeatures = {
  bank: { center: 0.22, halfLength: 0.09, radians: 0.055 },
  jump: {
    approach: leapT - 0.005,
    crest: leapT,
    end: leapT + 0.012,
    height: 3,
    laneCenter: -3.3,
    laneHalfWidth: 2.6,
    takeoffMinSpeed: 20,
    takeoffVelocity: 0,
  },
  landmarks: [
    { t: 0.04, name: 'Sunset Marina' },
    { t: 0.19, name: 'Serpent Cliffs' },
    { t: 0.36, name: 'Crystal Caverns' },
    { t: leapT, name: 'Lagoon Leap' },
    { t: 0.72, name: 'Jungle Rhythm' },
    { t: 0.91, name: 'Ocean Causeway' },
  ],
};
export const tunnels = [
  { start: 0.327, end: 0.378, height: 7.5 },
  { start: 0.424, end: 0.445, height: 7.5 },
];
export function tunnelAt(t: number, margin = 0) {
  return tunnels.find((v) => t >= v.start - margin && t <= v.end + margin);
}
export function bankAt(t: number) {
  return (
    0.045 *
    Math.sin(t * Math.PI * 8) *
    (smoothstep(0.09, 0.13, t) * (1 - smoothstep(0.84, 0.88, t)))
  );
}
export function baseHeight(t: number) {
  return (
    4 +
    14 * smoothstep(0.08, 0.22, t) * (1 - smoothstep(0.44, 0.51, t)) +
    5 * smoothstep(0.63, 0.7, t) * (1 - smoothstep(0.81, 0.88, t))
  );
}
export function roadHeight(t: number, lateral = 0) {
  t = ((t % 1) + 1) % 1;
  const j = trackFeatures.jump;
  const ramp =
    t < j.crest ? smoothstep(j.approach, j.crest, t) : 1 - smoothstep(j.crest, j.crest + 0.003, t);
  const lane = 1 - smoothstep(2.1, 2.8, Math.abs(lateral - j.laneCenter));
  const crest = 0.95 * smoothstep(0.743, 0.747, t) * (1 - smoothstep(0.747, 0.75, t));
  return baseHeight(t) + Math.tan(bankAt(t)) * lateral + 3 * ramp * lane + crest + 0.035;
}
export const samples = Array.from({ length: SEGMENTS }, (_, i) => {
  const t = i / SEGMENTS,
    p = curve.getPointAt(t),
    tangent = curve.getTangentAt(t).normalize();
  return { p, tangent, side: new THREE.Vector3(-tangent.z, 0, tangent.x), t };
});
export function nearestTrack(x: number, z: number) {
  let best = Infinity,
    index = 0;
  for (let i = 0; i < SEGMENTS; i++) {
    const p = samples[i].p,
      d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  let t = samples[index].t,
    px = samples[index].p.x,
    pz = samples[index].p.z;
  for (const k of [index, (index + SEGMENTS - 1) % SEGMENTS]) {
    const a = samples[k],
      b = samples[(k + 1) % SEGMENTS],
      dx = b.p.x - a.p.x,
      dz = b.p.z - a.p.z,
      u = THREE.MathUtils.clamp(((x - a.p.x) * dx + (z - a.p.z) * dz) / (dx * dx + dz * dz), 0, 1),
      qx = a.p.x + u * dx,
      qz = a.p.z + u * dz,
      d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d <= best) {
      best = d;
      t = (k + u) / SEGMENTS;
      px = qx;
      pz = qz;
    }
  }
  const d = curve.getTangentAt(t % 1);
  return { distance: Math.sqrt(best), index, t: t % 1, lateral: (x - px) * -d.z + (z - pz) * d.x };
}
export const terrainHeight = (_x: number, _z: number) => -6;
export function surfaceAt(x: number, z: number) {
  const n = nearestTrack(x, z);
  return { ...n, height: n.distance < 7.4 ? roadHeight(n.t, n.lateral) : -6 };
}
export function poseAt(t: number) {
  t = ((t % 1) + 1) % 1;
  const p = curve.getPointAt(t),
    d = curve.getTangentAt(t);
  p.y = roadHeight(t) - 0.035;
  return { p, yaw: Math.atan2(-d.x, -d.z) };
}
export function isGap(t: number, lateral: number) {
  return t >= trackFeatures.jump.crest && t < trackFeatures.jump.crest + 0.0027 && lateral < -0.6;
}
export function ribbon(inner: number, outer: number, y: number) {
  const positions: number[] = [],
    indices: number[] = [],
    columns = Math.max(1, Math.ceil((outer - inner) / 0.5));
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = samples[i % SEGMENTS];
    for (let j = 0; j <= columns; j++) {
      const w = inner + ((outer - inner) * j) / columns;
      positions.push(s.p.x + s.side.x * w, roadHeight(s.t, w) + y - 0.035, s.p.z + s.side.z * w);
    }
    if (i < SEGMENTS)
      for (let j = 0; j < columns; j++) {
        const w = inner + ((outer - inner) * (j + 0.5)) / columns;
        if (isGap((i + 0.5) / SEGMENTS, w)) continue;
        const a = i * (columns + 1) + j,
          b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function terrainGeometry() {
  const g = new THREE.PlaneGeometry(2400, 2400, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(250, -6, 0);
  return g;
}
export const checkpoints = Array.from({ length: 18 }, (_, i) => {
  const t = i / 18;
  return { ...poseAt(t), t, tangent: curve.getTangentAt(t) };
});
export function crossedGate(previous: THREE.Vector3, current: THREE.Vector3, index: number) {
  const c = checkpoints[index],
    a = (previous.x - c.p.x) * c.tangent.x + (previous.z - c.p.z) * c.tangent.z,
    b = (current.x - c.p.x) * c.tangent.x + (current.z - c.p.z) * c.tangent.z;
  if (a >= 0 || b < 0) return false;
  const u = -a / (b - a),
    x = previous.x + (current.x - previous.x) * u - c.p.x,
    z = previous.z + (current.z - previous.z) * u - c.p.z,
    y = previous.y + (current.y - previous.y) * u;
  return Math.abs(x * c.tangent.z - z * c.tangent.x) <= 6.8 && Math.abs(y - c.p.y) < 8;
}
