import * as THREE from 'three';
import * as coast from './CoralCoast';
export const landSection = (t: number) => t < 0.505 || (t > 0.635 && t < 0.835) || t > 0.965;
export function landHeight(t: number, w: number) {
  const d = Math.abs(w),
    h = coast.roadHeight(t, 0) - 0.035;
  if (d < 8) return h - 0.18;
  if (d < 15) return THREE.MathUtils.lerp(h - 0.18, h - 1.1, (d - 8) / 7);
  if (d < 28) return THREE.MathUtils.lerp(h - 1.1, Math.max(0.6, h - 3.5), (d - 15) / 13);
  if (d < 46) return THREE.MathUtils.lerp(Math.max(0.6, h - 3.5), -0.65, (d - 28) / 18);
  return THREE.MathUtils.lerp(-0.65, -3.5, Math.min(1, (d - 46) / 24));
}
export function coastPoint(t: number, w: number) {
  const p = coast.poseAt(t).p,
    d = coast.curve.getTangentAt(t);
  p.x -= d.z * w;
  p.z += d.x * w;
  p.y = landHeight(t, w);
  return p;
}
export function landGeometry() {
  const pos: number[] = [],
    colors: number[] = [],
    indices: number[] = [],
    widths = [7.1, 9, 15, 24, 34, 46, 58, 70];
  for (const side of [-1, 1])
    for (let i = 0; i < coast.SEGMENTS; i += 4) {
      const t = i / coast.SEGMENTS,
        next = (i + 4) / coast.SEGMENTS;
      if (!landSection(t) || !landSection(next % 1)) continue;
      const offset = pos.length / 3;
      for (const at of [t, next])
        for (const w of widths) {
          const p = coastPoint(at % 1, w * side),
            near = coast.nearestTrack(p.x, p.z);
          if (near.distance < 7.7) p.y = Math.min(p.y, coast.roadHeight(near.t) - 0.3);
          const grass = (at > 0.64 && at < 0.84) || at < 0.13,
            color = new THREE.Color(w > 34 ? '#e8d0a2' : grass ? '#77a986' : '#adac9b');
          color.multiplyScalar(0.9 + 0.1 * Math.sin(i * 0.7 + w));
          pos.push(p.x, p.y, p.z);
          colors.push(color.r, color.g, color.b);
        }
      for (let j = 0; j < widths.length - 1; j++) {
        const a = offset + j,
          b = a + widths.length;
        if (side > 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function shoreTexture() {
  const size = 128,
    bytes = new Uint8Array(size * size * 4),
    reference = coast.samples.filter((_, i) => i % 8 === 0);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const wx = -400 + ((x + 0.5) * 1500) / size,
        wz = -900 + ((z + 0.5) * 1500) / size;
      let best = Infinity,
        t = 0;
      for (const s of reference) {
        const d = (wx - s.p.x) ** 2 + (wz - s.p.z) ** 2;
        if (d < best) {
          best = d;
          t = s.t;
        }
      }
      const distance = Math.sqrt(best),
        i = (z * size + x) * 4;
      bytes[i] = landSection(t) ? Math.round(255 * Math.max(0, 1 - distance / 90)) : 0;
      bytes[i + 1] = landSection(t) ? Math.round(255 * Math.exp(-(((distance - 47) / 5) ** 2))) : 0;
      bytes[i + 2] = 0;
      bytes[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export function frondGeometry() {
  const p: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 9; i++) {
    const u = i / 9,
      width = Math.sin(Math.PI * u) * 0.85 * (i % 2 ? 0.88 : 1),
      y = 0.8 * Math.sin(u * Math.PI) - u * 0.85;
    p.push(-width, y - 0.13, u * 4.7, 0, y + 0.1, u * 4.7, width, y - 0.13, u * 4.7);
    if (i < 9) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function trunkGeometry() {
  const g = new THREE.CylinderGeometry(0.17, 0.3, 1, 5, 4);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + y * y * 0.55);
  }
  g.computeVertexNormals();
  return g;
}
