import * as THREE from 'three';
export const ROAD_WIDTH = 12;
export function terrainHeight(x: number, z: number) {
  return 4 * Math.exp(-(((x - 235) / 95) ** 2 + ((z + 30) / 105) ** 2));
}
export const palette = {
  road: '#343743',
  grass: '#50b58c',
  pine: '#25866e',
  cream: '#ffe2a0',
  coral: '#f08062',
  barrier: '#e7eef0',
};
const points = [
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
export const curve = new THREE.CatmullRomCurve3(
  points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true,
  'centripetal',
);
export const TRACK_LENGTH = curve.getLength();
export const SEGMENTS = 600;
export const samples = Array.from({ length: SEGMENTS }, (_, i) => {
  const t = i / SEGMENTS,
    p = curve.getPointAt(t),
    tangent = curve.getTangentAt(t).normalize();
  return { p, tangent, side: new THREE.Vector3(-tangent.z, 0, tangent.x), t };
});
export function poseAt(t: number) {
  const p = curve.getPointAt(((t % 1) + 1) % 1),
    d = curve.getTangentAt(((t % 1) + 1) % 1);
  p.y = terrainHeight(p.x, p.z);
  return { p, yaw: Math.atan2(-d.x, -d.z) };
}
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
  return { distance: Math.sqrt(best), index, t: index / SEGMENTS };
}
export function ribbon(inner: number, outer: number, y: number) {
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = samples[i % SEGMENTS];
    for (const w of [inner, outer]) {
      const x = s.p.x + s.side.x * w,
        z = s.p.z + s.side.z * w;
      positions.push(x, y + terrainHeight(x, z), z);
    }
    if (i < SEGMENTS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
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
