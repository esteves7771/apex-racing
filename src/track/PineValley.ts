import * as THREE from 'three';
import { bankAt, jumpAt, smoothstep } from './TrackFeatures';
export { TRACK_LAYOUT_ID, TRACK_INFO, trackFeatures } from './TrackFeatures';
export const ROAD_WIDTH = 12;
export const palette = {
  road: '#343743',
  grass: '#50b58c',
  pine: '#25866e',
  cream: '#ffe2a0',
  coral: '#f08062',
  barrier: '#e7eef0',
};
export const originalPoints = [
  [0, 100],
  [0, 20],
  [-18, -30],
  [12, -80],
  [55, -125],
  [115, -125],
  [155, -85],
  [155, -15],
  [190, 35],
  [220, 10],
  [225, -65],
  [270, -80],
  [300, -30],
  [290, 70],
  [230, 130],
  [140, 170],
  [85, 215],
  [25, 215],
  [-10, 175],
];
export const evolutionPoints = originalPoints.map((p) => [...p]);
evolutionPoints[2] = [-21, -30];
evolutionPoints[3] = [15, -81];
evolutionPoints[9] = [222, 12];
evolutionPoints.splice(17, 0, [62, 220], [43, 210]);
export const curve = new THREE.CatmullRomCurve3(
  evolutionPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  'centripetal',
);
export const TRACK_LENGTH = curve.getLength();
export const SEGMENTS = 720;
export const samples = Array.from({ length: SEGMENTS }, (_, i) => {
  const t = i / SEGMENTS,
    p = curve.getPointAt(t),
    tangent = curve.getTangentAt(t).normalize();
  return { p, tangent, side: new THREE.Vector3(-tangent.z, 0, tangent.x), t };
});
export function nearestTrack(x: number, z: number) {
  let best = Infinity,
    index = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].p,
      d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  const a = samples[index],
    b = samples[(index + 1) % samples.length],
    previous = samples[(index - 1 + samples.length) % samples.length];
  let bestPoint = a.p.clone(),
    bestT = a.t;
  for (const [p, q, t] of [
    [a.p, b.p, a.t],
    [previous.p, a.p, previous.t],
  ] as const) {
    const dx = q.x - p.x,
      dz = q.z - p.z,
      u = THREE.MathUtils.clamp(((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz), 0, 1),
      point = new THREE.Vector3(p.x + dx * u, 0, p.z + dz * u),
      distance = (x - point.x) ** 2 + (z - point.z) ** 2;
    if (distance < best) {
      best = distance;
      bestPoint = point;
      bestT = (t + u / SEGMENTS) % 1;
    }
  }
  const tangent = curve.getTangentAt(bestT),
    lateral = (x - bestPoint.x) * -tangent.z + (z - bestPoint.z) * tangent.x;
  return { distance: Math.sqrt(best), index, t: bestT, lateral };
}
export function baseHeight(x: number, z: number) {
  return (
    4 * Math.exp(-(((x - 235) / 95) ** 2 + ((z + 30) / 105) ** 2)) +
    2 * Math.exp(-(((x - 185) / 65) ** 2 + ((z - 145) / 58) ** 2))
  );
}
export function terrainHeight(x: number, z: number) {
  const distance = nearestTrack(x, z).distance;
  const outer = smoothstep(13, 40, distance);
  return (
    baseHeight(x, z) -
    0.45 * (1 - smoothstep(8, 13, distance)) +
    outer * (1.8 * Math.sin(x * 0.026) * Math.cos(z * 0.022) + 0.7 * Math.sin((x + z) * 0.05))
  );
}
export function roadHeight(t: number, lateral = 0) {
  const p = curve.getPointAt(((t % 1) + 1) % 1),
    d = curve.getTangentAt(((t % 1) + 1) % 1),
    x = p.x - d.z * lateral,
    z = p.z + d.x * lateral;
  return baseHeight(x, z) + Math.tan(bankAt(t)) * lateral + jumpAt(t, lateral) + 0.035;
}
export function surfaceAt(x: number, z: number) {
  const near = nearestTrack(x, z);
  return {
    ...near,
    height: near.distance <= 7.3 ? roadHeight(near.t, near.lateral) : terrainHeight(x, z),
  };
}
export function poseAt(t: number) {
  t = ((t % 1) + 1) % 1;
  const p = curve.getPointAt(t),
    d = curve.getTangentAt(t);
  p.y = roadHeight(t) - 0.035;
  return { p, yaw: Math.atan2(-d.x, -d.z) };
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
  const g = new THREE.PlaneGeometry(1300, 1300, 180, 180);
  g.rotateX(-Math.PI / 2);
  g.translate(100, 0, 50);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - 0.015);
  g.computeVertexNormals();
  return g;
}
export function shoulderGeometry(side: number) {
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = samples[i % SEGMENTS];
    for (const w of [7.1, 10.5]) {
      const x = s.p.x + s.side.x * w * side,
        z = s.p.z + s.side.z * w * side;
      positions.push(
        x,
        w === 7.1 ? roadHeight(s.t, w * side) - 0.01 : terrainHeight(x, z) + 0.02,
        z,
      );
    }
    if (i < SEGMENTS) {
      const a = i * 2;
      if (side > 0) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export const checkpoints = Array.from({ length: 8 }, (_, i) => {
  const t = i / 8;
  return { ...poseAt(t), tangent: curve.getTangentAt(t), t };
});
export function crossedGate(previous: THREE.Vector3, current: THREE.Vector3, index: number) {
  const cp = checkpoints[index],
    a = previous.clone().sub(cp.p).dot(cp.tangent),
    b = current.clone().sub(cp.p).dot(cp.tangent);
  if (a >= 0 || b < 0) return false;
  const hit = previous
    .clone()
    .lerp(current, -a / (b - a))
    .sub(cp.p);
  return Math.abs(hit.x * cp.tangent.z - hit.z * cp.tangent.x) <= ROAD_WIDTH / 2 + 0.8;
}
