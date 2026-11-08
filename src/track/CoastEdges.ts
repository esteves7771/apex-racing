import * as THREE from 'three';
import * as coast from './CoralCoast';
const cache = new Map<number, THREE.Vector3[]>();
const first = 1620,
  last = 1710;
/** Remove the local inward-offset loop; centerline, surface heights and route rules stay intact. */
function edge(w: number) {
  let points = cache.get(w);
  if (points) return points;
  points = coast.samples.map((s) => s.p.clone().addScaledVector(s.side, w));
  for (let i = first; i < last; i++)
    for (let j = i + 2; j < last; j++) {
      const a = points[i],
        b = points[i + 1],
        c = points[j],
        d = points[j + 1],
        rx = b.x - a.x,
        rz = b.z - a.z,
        sx = d.x - c.x,
        sz = d.z - c.z,
        den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const u = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den,
        v = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
      if (u > 1e-7 && u < 1 - 1e-7 && v > 1e-7 && v < 1 - 1e-7) {
        const hit = a.clone().lerp(b, u);
        for (let k = i + 1; k <= j; k++) points[k] = hit.clone();
      }
    }
  cache.set(w, points);
  return points;
}
export function coastEdgePoint(t: number, w: number) {
  const a = edge(w),
    n = (((t % 1) + 1) % 1) * coast.SEGMENTS,
    i = Math.floor(n);
  return a[i].clone().lerp(a[(i + 1) % a.length], n - i);
}
export const coastArtTrack = { ...coast, edgePoint: coastEdgePoint };
export function edgeRibbon(inner: number, outer: number, y: number) {
  const g = coast.ribbon(inner, outer, y),
    p = g.getAttribute('position'),
    columns = Math.max(1, Math.ceil((outer - inner) / 0.5));
  for (let i = first; i <= last; i++)
    for (let j = 0; j <= columns; j++) {
      const at = i * (columns + 1) + j,
        w = inner + ((outer - inner) * j) / columns,
        q = coastEdgePoint(i / coast.SEGMENTS, w);
      p.setX(at, q.x);
      p.setZ(at, q.z);
    }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
