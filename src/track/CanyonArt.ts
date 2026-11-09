import * as THREE from 'three';
import { ArtBuilder } from './ArtAssets';
import * as canyon from './CanyonCarnival';

export type CanyonItem = { position: THREE.Vector3; scale: THREE.Vector3; rotation?: number };
export type CanyonChunk = { center: THREE.Vector3; geometry: THREE.BufferGeometry };
const yAxis = new THREE.Vector3(0, 1, 0);
export function beam(
  b: ArtBuilder,
  a: THREE.Vector3,
  c: THREE.Vector3,
  width: number,
  color: string,
) {
  const d = c.clone().sub(a),
    q = new THREE.Quaternion().setFromUnitVectors(yAxis, d.clone().normalize()),
    e = new THREE.Euler().setFromQuaternion(q);
  b.add(
    new THREE.BoxGeometry(width, d.length(), width),
    color,
    a.clone().add(c).multiplyScalar(0.5),
    [1, 1, 1],
    [e.x, e.y, e.z],
  );
}
function local(b: ArtBuilder, p: THREE.Vector3, yaw: number) {
  return {
    point: (v: number[]) => new THREE.Vector3(...v).applyAxisAngle(yAxis, yaw).add(p),
    box: (v: number[], s: number[], c: string, rz = 0) =>
      b.box(new THREE.Vector3(...v).applyAxisAngle(yAxis, yaw).add(p).toArray(), s, c, [
        0,
        yaw,
        rz,
      ]),
    add: (g: THREE.BufferGeometry, v: number[], s: number[], c: string, r: number[] = [0, 0, 0]) =>
      b.add(g, c, new THREE.Vector3(...v).applyAxisAngle(yAxis, yaw).add(p), s, [
        r[0],
        yaw + r[1],
        r[2],
      ]),
  };
}
function placed(t: number, lateral: number, radius = 2) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = canyon.routePose(t, 'main', lateral + Math.sign(lateral) * attempt * 12).p,
      n = canyon.nearestTrack(p.x, p.z);
    if (n.distance > canyon.roadWidthAt(n.t, n.route) / 2 + radius + 3) {
      p.y = canyon.terrainHeight(p.x, p.z);
      return p;
    }
  }
  return undefined;
}
function tent(b: ArtBuilder, p: THREE.Vector3, yaw: number, color: string) {
  const l = local(b, p, yaw);
  for (const x of [-3.6, 3.6])
    for (const z of [-3, 3]) l.box([x, 1.7, z], [0.16, 3.4, 0.16], '#ead5a1');
  l.add(new THREE.ConeGeometry(5.3, 2.2, 4), [0, 4, 0], [1, 1, 1], color, [0, Math.PI / 4, 0]);
  l.box([0, 0.7, 1.8], [5.5, 1.4, 0.7], '#e7c993');
  l.box([0, 1.5, 1.8], [5.8, 0.18, 1.1], '#355c5c');
  for (let i = 0; i < 4; i++)
    l.box([-2 + i * 1.3, 2.9, -3], [1.2, 0.28, 0.1], i % 2 ? '#f2d86b' : '#e98968');
}
function grandstand(b: ArtBuilder, p: THREE.Vector3, yaw: number) {
  const l = local(b, p, yaw);
  l.box([0, 0.4, 0], [15, 0.8, 9], '#91634e');
  for (let row = 0; row < 4; row++) {
    l.box([0, 0.8 + row * 0.85, -3 + row * 1.8], [14, 0.4, 1.8], row % 2 ? '#e7c999' : '#b87952');
    l.box([0, 1.25 + row * 0.85, -2.6 + row * 1.8], [13.5, 0.18, 0.55], '#316263');
  }
  for (const x of [-7, 7]) {
    l.box([x, 3.3, 0], [0.22, 6.6, 0.22], '#d6be8d');
    l.box([x, 6.4, 0], [0.35, 0.3, 10], '#ebbc6f');
  }
  l.box([0, 6.7, 0], [16, 0.35, 10], '#287278');
  l.box([0, 2.3, -4.6], [15, 0.7, 0.15], '#e4b864');
  for (let i = 0; i < 6; i++) l.box([-6 + i * 2.4, 3.1, -4.6], [0.1, 1.7, 0.1], '#e9d7aa');
}
function truck(b: ArtBuilder, p: THREE.Vector3, yaw: number) {
  const l = local(b, p, yaw);
  l.box([0, 1.1, 0], [2.6, 0.75, 5.6], '#f0d6a5');
  l.box([0, 2, -1.65], [2.5, 1.7, 2.1], '#c16c50');
  l.box([0, 2.3, -2.73], [2.12, 0.65, 0.06], '#28555c');
  l.box([0, 1.8, 1.2], [2.35, 0.25, 2.9], '#5c6057');
  for (const x of [-1.3, 1.3])
    for (const z of [-1.85, 1.7])
      l.add(new THREE.CylinderGeometry(0.57, 0.57, 0.28, 10), [x, 0.6, z], [1, 1, 1], '#303d41', [
        0,
        0,
        Math.PI / 2,
      ]);
  l.box([0, 1, -2.86], [2.5, 0.2, 0.15], '#e5e4c9');
  for (const x of [-0.85, 0.85]) l.box([x, 1.4, -2.78], [0.4, 0.28, 0.1], '#fff0b3');
}
function cabin(b: ArtBuilder, p: THREE.Vector3, yaw: number, mine = false) {
  const l = local(b, p, yaw),
    wall = mine ? '#936347' : '#d2a878';
  l.box([0, 2.8, 0], [9, 5.6, 7], wall);
  l.box([0, 5.7, 0], [10, 0.4, 8], '#52605a');
  for (const x of [-4.35, 4.35]) l.box([x, 2.8, 0], [0.24, 5.6, 7.2], '#5c4b3e');
  l.box([0, 1.8, -3.56], [2, 3.6, 0.15], '#375553');
  for (const x of [-2.9, 2.9]) {
    l.box([x, 3.3, -3.56], [1.7, 1.8, 0.15], '#355e63');
    l.box([x, 3.3, -3.68], [0.12, 1.8, 0.05], '#e9cf99');
  }
  for (let i = 0; i < 8; i++) l.box([0, 0.4 + i * 0.66, -3.6], [9, 0.06, 0.08], '#704e3e');
  l.box([0, 4.8, -4.3], [10, 0.2, 2], '#c16d4e');
}
function crane(b: ArtBuilder, p: THREE.Vector3, yaw: number) {
  const l = local(b, p, yaw);
  l.box([0, 0.5, 0], [7, 1, 7], '#7c6250');
  for (const x of [-2, 2]) {
    l.box([x, 7.5, 0], [0.45, 14, 0.45], '#b6834b');
    for (let i = 0; i < 6; i++)
      beam(b, l.point([x, 1 + i * 2.2, -0.1]), l.point([-x, 3 + i * 2.2, 0.1]), 0.16, '#6d5744');
  }
  beam(b, l.point([0, 14, 0]), l.point([0, 18, -12]), 0.7, '#d5ab55');
  beam(b, l.point([0, 11, 0]), l.point([0, 18, -12]), 0.13, '#475552');
  l.box([0, 11, -12], [0.08, 14, 0.08], '#3e4c4a');
  l.add(
    new THREE.TorusGeometry(0.45, 0.12, 5, 8, Math.PI * 1.5),
    [0, 3.9, -12],
    [1, 1, 1],
    '#343c3b',
  );
  l.box([3, 3, 0], [3, 3.2, 4], '#87624b');
  l.box([3, 3.6, -2.05], [2.4, 1.6, 0.1], '#2d5358');
}
function mineRail(b: ArtBuilder, p: THREE.Vector3, yaw: number) {
  const l = local(b, p, yaw);
  for (const x of [-1.2, 1.2]) l.box([x, 0.14, 0], [0.12, 0.22, 20], '#63716c');
  for (let i = 0; i < 12; i++) l.box([0, 0.06, -9 + i * 1.7], [3, 0.14, 0.32], '#67513e');
  l.box([0, 0.9, -2], [2.6, 1.2, 3], '#705c4b');
  l.box([0, 1.6, -2], [2.4, 0.14, 2.8], '#4b4a43');
  for (const x of [-1.3, 1.3])
    for (const z of [-3, -1])
      l.add(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 8), [x, 0.45, z], [1, 1, 1], '#384448', [
        0,
        0,
        Math.PI / 2,
      ]);
}
function mesa(b: ArtBuilder, p: THREE.Vector3, w: number, d: number, h: number, seed: number) {
  let floor = p.y;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    floor = Math.min(floor, canyon.terrainHeight(p.x + Math.cos(a) * w, p.z + Math.sin(a) * d));
  }
  floor -= 3;
  h += p.y - floor;
  p = p.clone().setY(floor);
  const palette = ['#925340', '#ae6547', '#c38054', '#d49761', '#d9ae76'];
  for (let i = 0; i < 5; i++) {
    const r = 1 - i * 0.095;
    b.add(
      new THREE.CylinderGeometry(r - 0.055, r, h / 5, 7),
      palette[(seed + i) % palette.length],
      [p.x + Math.sin(i * 2 + seed) * 1.4, p.y + ((i + 0.5) * h) / 5, p.z],
      [w, 1, d],
      [0, seed * 0.7, 0],
    );
  }
  b.add(
    new THREE.IcosahedronGeometry(1, 0),
    '#d9ac73',
    [p.x, p.y + h, p.z],
    [w * 0.72, 2, d * 0.65],
    [0, seed, 0],
  );
}
function arch(b: ArtBuilder, t: number, radius: number) {
  const p = canyon.routePose(t),
    g = new THREE.TorusGeometry(radius, 5.5, 5, 18, Math.PI);
  b.add(g, '#bd8057', [p.p.x, p.p.y - 6, p.p.z], [1, 1, 1], [0, p.yaw, 0]);
  for (const side of [-1, 1]) {
    const foot = canyon.routePose(t, 'main', side * radius).p;
    const n = canyon.nearestTrack(foot.x, foot.z);
    if (n.distance < canyon.roadWidthAt(n.t, n.route) / 2 + 16) continue;
    let floor = canyon.terrainHeight(foot.x, foot.z);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      floor = Math.min(
        floor,
        canyon.terrainHeight(foot.x + Math.cos(a) * 12, foot.z + Math.sin(a) * 12),
      );
    }
    foot.y = floor - 4;
    const height = Math.max(16, p.p.y + 4 - foot.y);
    b.add(new THREE.CylinderGeometry(8, 12, height, 7), '#a76b4c', [
      foot.x,
      foot.y + height / 2,
      foot.z,
    ]);
  }
}
function deck(b: ArtBuilder, start: number, end: number, route: string) {
  const count = Math.ceil(((end - start) * canyon.TRACK_LENGTH) / 5);
  for (let i = 0; i < count; i++) {
    const t = THREE.MathUtils.lerp(start, end, i / count),
      next = THREE.MathUtils.lerp(start, end, (i + 1) / count),
      w = canyon.roadWidthAt(t, route) / 2 + 0.1,
      wn = canyon.roadWidthAt(next, route) / 2 + 0.1;
    for (const side of [-1, 1]) {
      const a = canyon.routePose(t, route, side * w).p,
        c = canyon.routePose(next, route, side * wn).p;
      const pos = [
        a.x,
        a.y - 0.12,
        a.z,
        c.x,
        c.y - 0.12,
        c.z,
        a.x,
        a.y - 1.25,
        a.z,
        c.x,
        c.y - 1.25,
        c.z,
      ];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex([0, 1, 2, 2, 1, 3]);
      g.computeVertexNormals();
      b.add(g, t > 0.58 && t < 0.72 ? '#d7c596' : '#997957');
    }
    if (i % 5 === 0 && ((t > 0.44 && t < 0.57) || (t > 0.595 && t < 0.715))) {
      for (const side of [-1, 1]) {
        const p = canyon.routePose(t, route, side * (w - 0.8)).p,
          floor = canyon.terrainHeight(p.x, p.z),
          height = Math.max(2, p.y - floor - 1);
        b.box([p.x, p.y - 1 - height / 2, p.z], [1.5, height, 1.5], '#bda77d');
        b.box([p.x, p.y - 1.35, p.z], [3, 0.6, 3], '#e2cda0');
      }
    }
  }
}
export function buildCanyonChunks() {
  return Array.from({ length: 20 }, (_, index): CanyonChunk => {
    const start = index / 20,
      end = (index + 1) / 20,
      center = canyon.routePose((start + end) / 2).p,
      b = new ArtBuilder();
    deck(b, start, end, 'main');
    for (const branch of canyon.branches)
      if (branch.end > start && branch.start < end)
        deck(b, Math.max(start, branch.start), Math.min(end, branch.end), branch.id);
    // Low overhead, source-aligned timber supports make the mine tunnel read as a worked excavation.
    for (const tunnel of canyon.tunnels) {
      const count = Math.floor(((tunnel.end - tunnel.start) * canyon.TRACK_LENGTH) / 18);
      for (let k = 0; k <= count; k++) {
        const t = tunnel.start + ((tunnel.end - tunnel.start) * k) / count;
        if (t < start || t >= end) continue;
        const pose = canyon.routePose(t, tunnel.route),
          l = local(b, pose.p, pose.yaw),
          half = canyon.roadWidthAt(t, tunnel.route) / 2;
        for (const side of [-1, 1])
          l.box(
            [side * (half + 1.05), 3.55, 0],
            [0.3, 7.1, 0.35],
            tunnel.route === 'mine' ? '#94734d' : '#bd9870',
          );
        l.box(
          [0, 7.5, 0],
          [2 * (half + 1.3), 0.28, 0.4],
          tunnel.route === 'mine' ? '#8e6d47' : '#cfb287',
        );
      }
    }
    for (let k = 0; k < 4; k++) {
      const t = start + ((k + 0.5) * (end - start)) / 4;
      for (const side of [-1, 1]) {
        const p = canyon.routePose(t, 'main', side * (canyon.roadWidthAt(t) / 2 + 1.8)).p;
        b.box([p.x, p.y + 0.6, p.z], [0.13, 1.2, 0.13], '#bba57d');
        b.box([p.x, p.y + 1.12, p.z], [0.27, 0.2, 0.12], '#f6d36b');
      }
    }
    // Authored roadside detail rhythm changes with section, rather than uniformly scattering identical props.
    const section = canyon.sectionAt((start + end) / 2),
      oasis = section.name === 'Emerald Oasis';
    for (let k = 0; k < 4; k++) {
      const t = start + ((k + 0.5) * (end - start)) / 4,
        side = (k + index) % 2 ? 1 : -1;
      const p = placed(t, side * (oasis ? 75 : 68), 25);
      if (p && !oasis)
        mesa(b, p, 18 + (k % 2) * 6, 17 + (index % 3) * 4, 24 + (index % 4) * 8, index + k);
    }
    if (index < 3 || index >= 18) {
      for (let k = 0; k < 2; k++) {
        const t = start + 0.009 + k * 0.023,
          p = placed(t, (k % 2 ? 1 : -1) * 24, 6);
        if (p) tent(b, p, canyon.routePose(t).yaw, k % 2 ? '#e6bb62' : '#c97958');
      }
      if (index === 0) {
        const t = 0.041,
          p = placed(t, -34, 10);
        if (p) grandstand(b, p, canyon.routePose(t).yaw - Math.PI / 2);
        const vehicle = placed(0.038, 24, 5);
        if (vehicle) truck(b, vehicle, canyon.routePose(0.038).yaw - Math.PI / 2);
      }
      if (index === 0 || index === 19) {
        for (const side of [-1, 1]) {
          const t = index === 0 ? 0.008 : 0.988,
            p = placed(t, side * 33, 10);
          if (p)
            grandstand(b, p, canyon.routePose(t).yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
        }
      }
      if (index === 1 || index === 18) {
        const t = start + 0.02,
          p = placed(t, -25, 5);
        if (p) truck(b, p, canyon.routePose(t).yaw + Math.PI / 2);
      }
    }
    if (index === 4 || index === 13) arch(b, start + 0.025, index === 13 ? 34 : 28);
    if (index >= 6 && index <= 8) {
      for (let k = 0; k < 2; k++) {
        const t = start + 0.012 + k * 0.025,
          p = placed(t, 26, 9);
        if (p) cabin(b, p, canyon.routePose(t).yaw + Math.PI / 2, true);
      }
    }
    if (index >= 6 && index <= 8) {
      const t = start + 0.024,
        p = placed(t, -28, index === 6 ? 14 : 11);
      if (p) {
        if (index === 6) crane(b, p, canyon.routePose(t).yaw);
        else if (index === 7) mineRail(b, p, canyon.routePose(t).yaw);
        else cabin(b, p, canyon.routePose(t).yaw - Math.PI / 2, true);
      }
    }
    if (index >= 9 && index <= 11) {
      const t = start + 0.02,
        p = placed(t, 26, 6);
      if (p) {
        cabin(b, p, canyon.routePose(t).yaw + Math.PI / 2);
        for (let j = 0; j < 8; j++)
          b.box(
            [p.x + Math.cos(j) * 4, p.y + 0.3, p.z + Math.sin(j) * 4],
            [0.5, 0.4, 0.5],
            j % 2 ? '#f1bd78' : '#d78486',
          );
      }
    }
    if (index === 12) {
      const t = 0.633,
        pose = canyon.routePose(t, 'main', -20),
        p = pose.p,
        l = local(b, p, pose.yaw);
      l.box([0, -0.8, 0], [9, 0.5, 15], '#b99a6b');
      for (const x of [-3.6, 3.6])
        for (const z of [-6, 6]) {
          const q = l.point([x, 0, z]),
            floor = canyon.terrainHeight(q.x, q.z);
          b.box([q.x, (p.y + floor) / 2, q.z], [0.65, p.y - floor, 0.65], '#8c7054');
        }
    }
    if (index >= 15 && index <= 17) {
      const t = start + 0.02,
        p = placed(t, -24, 6);
      if (p) {
        beam(
          b,
          p.clone().add(new THREE.Vector3(-5, 0, -2)),
          p.clone().add(new THREE.Vector3(4, 3, 2)),
          0.6,
          '#80573e',
        );
        beam(
          b,
          p.clone().add(new THREE.Vector3(4, 0, -2)),
          p.clone().add(new THREE.Vector3(-2, 2, 3)),
          0.5,
          '#a67b4d',
        );
      }
    }
    return { center, geometry: b.finish() };
  });
}
export function makeCanyonPalm() {
  const b = new ArtBuilder();
  b.add(new THREE.CylinderGeometry(0.16, 0.42, 7, 6), '#987b48', [0, 3.5, 0]);
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7,
      p = new THREE.Vector3(Math.sin(a) * 2, 6.6, Math.cos(a) * 2);
    b.add(
      new THREE.ConeGeometry(0.7, 5.6, 3),
      '#4f9a69',
      p,
      [1, 1, 0.4],
      [Math.cos(a) * 1.3, a, Math.sin(a) * 1.3],
    );
  }
  b.add(new THREE.IcosahedronGeometry(0.7, 0), '#78ad61', [0, 7.1, 0]);
  return b.finish();
}
export function makeCactus() {
  const b = new ArtBuilder();
  b.add(new THREE.CylinderGeometry(0.25, 0.36, 3.6, 7), '#62845b', [0, 1.8, 0]);
  for (const side of [-1, 1]) {
    b.box([side * 0.7, 1.8, 0], [1.4, 0.4, 0.4], '#708f5e');
    b.add(new THREE.CylinderGeometry(0.19, 0.22, 1.2, 6), '#789664', [side * 1.2, 2.25, 0]);
  }
  return b.finish();
}
