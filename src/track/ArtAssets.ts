import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { frondGeometry, trunkGeometry } from './CoastLandscape';
/** Tier A/B: original, repeatable colored mesh families. Each caller owns its result. */
export class ArtBuilder {
  private parts: THREE.BufferGeometry[] = [];
  add(
    g: THREE.BufferGeometry,
    color: string,
    p: THREE.Vector3 | number[] = [0, 0, 0],
    scale: number[] = [1, 1, 1],
    rotation: number[] = [0, 0, 0],
  ) {
    const plain = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    const matrix = new THREE.Matrix4().compose(
      p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(rotation as [number, number, number])),
      ),
      new THREE.Vector3(...scale),
    );
    plain.applyMatrix4(matrix);
    plain.deleteAttribute('uv');
    const c = new THREE.Color(color),
      colors = new Float32Array(plain.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    plain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(plain);
    return this;
  }
  box(p: number[], s: number[], color: string, rotation: number[] = [0, 0, 0]) {
    return this.add(new THREE.BoxGeometry(), color, p, s, rotation);
  }
  finish() {
    const g = mergeGeometries(this.parts)!;
    this.parts.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    return g;
  }
}
export function forestTree(variant: number) {
  const b = new ArtBuilder(),
    h = variant === 0 ? 11 : variant === 1 ? 8 : 6.5;
  b.add(new THREE.CylinderGeometry(0.18, 0.36, h * 0.64, 7), '#796047', [0, h * 0.32, 0]);
  for (let i = 0; i < 5; i++) {
    const y = 2.1 + i * h * 0.15,
      r = (variant === 0 ? 2.3 : 2.8) * (1 - i * 0.17);
    b.add(
      new THREE.ConeGeometry(r, h * 0.39, variant === 2 ? 9 : 7),
      ['#24664e', '#347e56', '#4c9160', '#659c65', '#80ae75'][i],
      [0, y, 0],
      [1, 1, variant === 1 ? 0.88 : 1],
      [0, i * 0.67, 0],
    );
  }
  for (const s of [-1, 1])
    b.add(
      new THREE.CylinderGeometry(0.05, 0.13, 2.5, 5),
      '#70513b',
      [s * 0.7, 2.6, 0],
      [1, 1, 1],
      [0, 0, -s * 0.85],
    );
  return b.finish();
}
export function broadTree() {
  const b = new ArtBuilder();
  b.add(new THREE.CylinderGeometry(0.2, 0.44, 5, 6), '#8b7654', [0, 2.5, 0]);
  for (let i = 0; i < 5; i++)
    b.add(
      new THREE.IcosahedronGeometry(1, 1),
      ['#4b8056', '#6b9b60', '#8bab67'][i % 3],
      [Math.sin(i * 2.4) * 1.5, 4.6 + i * 0.35, Math.cos(i * 2.4) * 1.5],
      [2.2, 1.9, 2.2],
    );
  return b.finish();
}
export function groundPatch(tropical = false) {
  const b = new ArtBuilder();
  b.add(
    new THREE.DodecahedronGeometry(),
    tropical ? '#6c9560' : '#708652',
    [0, 0.02, 0],
    [2.8, 0.12, 2.2],
  );
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    b.add(
      new THREE.ConeGeometry(0.24, 0.85, 3),
      tropical ? '#6caa70' : '#a0b36b',
      [Math.sin(a) * 1.7, 0.35, Math.cos(a) * 1.5],
      [1, 1, 1],
      [0.2, a, 0.2],
    );
    b.add(
      new THREE.DodecahedronGeometry(),
      i % 3 ? '#658a59' : tropical ? '#e9a384' : '#e9cb84',
      [Math.sin(a) * 1.9, 0.5, Math.cos(a) * 1.7],
      [0.28, 0.17, 0.28],
    );
  }
  return b.finish();
}
export function fernAsset() {
  const b = new ArtBuilder();
  for (let i = 0; i < 7; i++)
    b.add(
      new THREE.ConeGeometry(0.2, 1.8, 3),
      i % 2 ? '#79a76b' : '#397b56',
      [Math.sin(i) * 0.45, 0.35, Math.cos(i) * 0.45],
      [1, 1, 1],
      [Math.sin(i) * 0.85, 0, Math.cos(i) * 0.85],
    );
  return b.finish();
}
export function rangerCabin() {
  const b = new ArtBuilder();
  b.box([0, 1.9, 0], [8, 3.8, 6], '#96704e');
  for (let i = 0; i < 12; i++)
    b.box([0, 0.25 + i * 0.29, -3.04], [8.2, 0.12, 0.12], i % 2 ? '#ba9366' : '#72533d');
  for (const side of [-1, 1]) {
    b.box([side * 2.2, 4.35, 0], [4.9, 0.24, 7.5], '#386b61', [0, 0, -side * 0.43]);
    b.box([side * 2.7, 2.4, -3.1], [1.5, 1.4, 0.14], '#f2dca3');
    b.box([side * 2.7, 2.4, -3.2], [1.2, 1.1, 0.08], '#416974');
    b.box([side * 3.6, 1.9, -4.3], [0.16, 3.8, 0.16], '#d2b58a');
  }
  b.box([0, 0.25, -4.3], [9, 0.5, 3], '#c3a078');
  b.box([0, 1.2, -3.07], [1.4, 2.4, 0.2], '#385a4b');
  b.box([0, 3.7, -4.4], [8.9, 0.22, 3], '#567c65', [0.08, 0, 0]);
  for (let i = 0; i < 3; i++) b.box([0, -0.15 - i * 0.2, -5.8 - i * 0.4], [3, 0.4, 0.6], '#aa9372');
  return b.finish();
}
export function lighthouse() {
  const b = new ArtBuilder();
  b.add(new THREE.CylinderGeometry(4.5, 5.2, 1.3, 10), '#d0be99', [0, 0.5, 0]);
  for (let i = 0; i < 6; i++)
    b.add(
      new THREE.CylinderGeometry(1.9 - i * 0.1, 2 - i * 0.1, 2.2, 10),
      i % 2 ? '#e48b6b' : '#f1e4bd',
      [0, 2 + i * 2.2, 0],
    );
  b.add(new THREE.CylinderGeometry(2.5, 2.5, 0.3, 12), '#426962', [0, 14.1, 0]);
  b.add(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 8), '#7fc6bc', [0, 15, 0]);
  b.add(new THREE.ConeGeometry(2, 1.1, 10), '#dc805f', [0, 16.3, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    b.box([Math.sin(a) * 2.3, 14.7, Math.cos(a) * 2.3], [0.1, 1.3, 0.1], '#e5dab4');
  }
  return b.finish();
}
export function palmTree() {
  const b = new ArtBuilder();
  b.add(trunkGeometry(), '#a38157', [0, 0, 0], [1, 8, 1]);
  for (let i = 0; i < 9; i++)
    b.add(
      frondGeometry(),
      ['#478658', '#70a963', '#a1bb6c'][i % 3],
      [0.5, 8, 0],
      [1, 1, 1],
      [0, (i * Math.PI * 2) / 9, 0],
    );
  for (let i = 0; i < 6; i++)
    b.add(new THREE.CylinderGeometry(0.22, 0.24, 0.09, 6), '#c4a16e', [
      0.55 * (i / 6) ** 2,
      1 + i,
      0,
    ]);
  return b.finish();
}
export function forestOverlook() {
  const b = new ArtBuilder();
  b.box([0, 0.1, 0], [13, 0.2, 3.5], '#8c7959');
  for (let i = 0; i < 18; i++)
    b.box([-6 + i * 0.7, 0.25, 0], [0.6, 0.12, 3.7], i % 2 ? '#b59b70' : '#c5ad7f');
  for (const side of [-1, 1]) {
    b.box([0, 1.4, side * 1.8], [13, 0.13, 0.13], '#ceba86');
    for (const x of [-6, -3, 0, 3, 6]) b.box([x, 0.8, side * 1.8], [0.16, 1.6, 0.16], '#76664c');
  }
  b.box([0, -0.12, 0], [7, 0.08, 20], '#72adab');
  for (let i = 0; i < 9; i++)
    b.add(
      new THREE.DodecahedronGeometry(),
      i % 2 ? '#859785' : '#a5aa88',
      [-5 + i * 1.3, -0.2, -5 + (i % 3) * 5],
      [1.4, 0.6, 1.3],
      [0, i, 0],
    );
  return b.finish();
}
