import { useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import * as canyon from './CanyonCarnival';
import { ArtBuilder } from './ArtAssets';
import { buildCanyonChunks, makeCanyonPalm, makeCactus, type CanyonItem } from './CanyonArt';
import { personGeometry } from '../render/WorldLife';
import { WindMaterial } from './WindMaterial';
import { TrackLabel } from './EvolutionScenery';
import { StartingLights } from './RaceVenue';
import { gridSpawn } from '../game/GrandPrix';
import { race, telemetry, useGame } from '../game/store';
import { carPosition, carForward } from '../vehicle/ArcadeVehicleController';

const axis = new THREE.Vector3(0, 1, 0);
function vertexGeometry(positions: number[], colors: number[], indices: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function paintGeometry() {
  const pos: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const quad = (points: THREE.Vector3[], color: string) => {
    const at = pos.length / 3,
      c = new THREE.Color(color);
    for (const p of points) {
      pos.push(p.x, p.y + 0.065, p.z);
      colors.push(c.r, c.g, c.b);
    }
    if (points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).y >= 0)
      indices.push(at, at + 1, at + 2, at + 2, at + 1, at + 3);
    else indices.push(at, at + 2, at + 1, at + 2, at + 3, at + 1);
  };
  // Reuse accepted physical boundary segments: no diagonal paint/kerbs crossing valid split openings.
  for (const rail of canyon.barriers) {
    const n = canyon.projectRoute(rail.p.x, rail.p.z),
      center = canyon.routePose(n.t, n.route).p,
      inward = center.clone().sub(rail.p).setY(0).normalize(),
      along = new THREE.Vector3(Math.sin(rail.yaw), 0, Math.cos(rail.yaw));
    const points = [];
    for (const u of [-0.5, 0.5])
      for (const w of [0.8, 1.35]) {
        const p = rail.p
            .clone()
            .addScaledVector(along, u * rail.length)
            .addScaledVector(inward, w),
          near = canyon.projectRoute(p.x, p.z, n.t, n.route);
        p.y = canyon.routePose(near.t, n.route, near.lateral).p.y;
        points.push(p);
      }
    quad(points, Math.floor((n.t * canyon.TRACK_LENGTH) / 4) % 2 ? '#f0d8a5' : '#c17852');
  }
  for (const t of [0, 1]) {
    const half = canyon.roadWidthAt(t) / 2,
      cols = 22;
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < cols; col++) {
        const points = [];
        for (const along of [-1.2 + row * 0.8, -0.4 + row * 0.8])
          for (const w of [-half + (col * half * 2) / cols, -half + ((col + 1) * half * 2) / cols])
            points.push(canyon.routePose(t + along / canyon.TRACK_LENGTH, 'main', w).p);
        quad(points, (col + row) % 2 ? '#f8e8bf' : '#273b3d');
      }
  }
  for (let slot = 0; slot < 4; slot++) {
    const grid = gridSpawn(slot);
    for (const side of [-1, 1]) {
      const points = [];
      for (const d of [-2.4, 2.4])
        for (const w of [side * 1.15 - 0.07, side * 1.15 + 0.07])
          points.push(canyon.routePose(grid.t + d / canyon.TRACK_LENGTH, 'main', grid.lane + w).p);
      quad(points, '#f3dfa8');
    }
    const points = [];
    for (const d of [-2.45, -2.3])
      for (const w of [-1.2, 1.2])
        points.push(canyon.routePose(grid.t + d / canyon.TRACK_LENGTH, 'main', grid.lane + w).p);
    quad(points, '#f3dfa8');
  }
  return vertexGeometry(pos, colors, indices);
}
function boostPaint() {
  const b = new ArtBuilder(),
    chevrons = new ArtBuilder();
  const quad = (
    builder: ArtBuilder,
    pad: (typeof canyon.boostPads)[number],
    shape: number[][],
    color: string,
  ) => {
    const eps = 0.0001,
      rate =
        canyon
          .routePose(pad.t + eps, pad.route)
          .p.distanceTo(canyon.routePose(pad.t - eps, pad.route).p) /
        (2 * eps),
      pos: number[] = [];
    for (const [w, along] of shape) {
      const p = canyon.routePose(pad.t + along / rate, pad.route, pad.lateral + w).p;
      pos.push(p.x, p.y + 0.09, p.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const a = new THREE.Vector3(...pos.slice(0, 3)),
      b = new THREE.Vector3(...pos.slice(3, 6)),
      c = new THREE.Vector3(...pos.slice(6, 9));
    g.setIndex(b.sub(a).cross(c.sub(a)).y >= 0 ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 2, 3, 1]);
    g.computeVertexNormals();
    builder.add(g, color);
  };
  for (const pad of canyon.boostPads) {
    quad(
      b,
      pad,
      [
        [-pad.width / 2, -pad.length / 2],
        [pad.width / 2, -pad.length / 2],
        [-pad.width / 2, pad.length / 2],
        [pad.width / 2, pad.length / 2],
      ],
      '#174f56',
    );
    for (const row of [-2.1, 2.1])
      for (const side of [-1, 1])
        quad(
          chevrons,
          pad,
          [
            [0, row + 1.2],
            [side * 1.35, row - 0.3],
            [0, row + 0.48],
            [side * 1.35, row - 1.0],
          ],
          '#5cfff0',
        );
  }
  return { base: b.finish(), chevrons: chevrons.finish() };
}
function archGeometry(flags: CanyonItem[]) {
  const b = new ArtBuilder();
  for (const t of [0, 1]) {
    const pose = canyon.routePose(t),
      yaw = pose.yaw,
      point = (x: number, y: number, z: number) =>
        new THREE.Vector3(x, y, z).applyAxisAngle(axis, yaw).add(pose.p);
    for (const side of [-1, 1]) {
      b.box(point(side * 10.7, 6.75, 0).toArray(), [1.5, 13.5, 1.8], t ? '#e4b660' : '#bd684b', [
        0,
        yaw,
        0,
      ]);
      b.box(point(side * 10.7, 1, 0).toArray(), [2, 2, 2.2], '#f0d7a6', [0, yaw, 0]);
    }
    b.box(point(0, 13.7, 0).toArray(), [23, 1.7, 1.7], t ? '#c57c50' : '#296264', [0, yaw, 0]);
    b.box(point(0, 14.7, 0).toArray(), [24, 0.3, 2.2], '#efcb83', [0, yaw, 0]);
    b.box(point(0, 13.7, 0.9).toArray(), [18, 1.15, 0.1], '#224f51', [0, yaw, 0]);
  }
  for (const flag of flags)
    b.box([flag.position.x, flag.position.y - 2.3, flag.position.z], [0.13, 4.6, 0.13], '#d4ba85');
  return b.finish();
}
function vegetation() {
  const palms: CanyonItem[] = [],
    cacti: CanyonItem[] = [],
    flags: CanyonItem[] = [],
    people: { p: THREE.Vector3; yaw: number; variant: number }[] = [];
  for (let i = 0; i < 170; i++) {
    const t = (i + 0.5) / 170,
      oasis = t > 0.435 && t < 0.575,
      side = i % 2 ? 1 : -1,
      w = side * (oasis ? 34 + (i % 4) * 6 : 15 + (i % 5) * 3),
      pose = canyon.routePose(t, 'main', w),
      n = canyon.nearestTrack(pose.p.x, pose.p.z);
    if (n.distance < canyon.roadWidthAt(n.t, n.route) / 2 + 5) continue;
    pose.p.y = canyon.terrainHeight(pose.p.x, pose.p.z);
    const s = 0.8 + (i % 4) * 0.19;
    (oasis ? palms : cacti).push({
      position: pose.p,
      rotation: i * 2.4,
      scale: new THREE.Vector3(s, s, s),
    });
  }
  for (let cluster = 0; cluster < 12; cluster++)
    for (let j = 0; j < 4; j++) {
      const t = 0.445 + cluster * 0.01 + j * 0.00065,
        side = cluster % 2 ? 1 : -1,
        pose = canyon.routePose(t, 'main', side * (43 + j * 4)),
        n = canyon.nearestTrack(pose.p.x, pose.p.z);
      if (n.distance < canyon.roadWidthAt(n.t, n.route) / 2 + 6) continue;
      pose.p.y = canyon.terrainHeight(pose.p.x, pose.p.z);
      const scale = 1.1 + j * 0.12;
      palms.push({
        position: pose.p,
        rotation: cluster * 1.7 + j,
        scale: new THREE.Vector3(scale, scale, scale),
      });
    }
  for (const [anchor, side] of [
    [0.005, -1],
    [0.014, 1],
    [0.026, -1],
    [0.479, 1],
    [0.533, 1],
    [0.633, -1],
    [0.977, -1],
    [0.991, 1],
  ])
    for (let i = 0; i < 10; i++) {
      const t = anchor + ((i % 5) - 2) * 0.00055,
        lateral =
          side *
          (anchor > 0.43 && anchor < 0.58
            ? 39 + (i % 2) * 2
            : anchor === 0.633
              ? 19 + (i % 2) * 1.8
              : 14 + (i % 2) * 2),
        pose = canyon.routePose(t, 'main', lateral),
        n = canyon.nearestTrack(pose.p.x, pose.p.z);
      if (n.distance < canyon.roadWidthAt(n.t, n.route) / 2 + 3) continue;
      pose.p.y =
        anchor === 0.633
          ? canyon.routePose(t).p.y - 0.65
          : canyon.terrainHeight(pose.p.x, pose.p.z);
      people.push({ p: pose.p, yaw: pose.yaw - (side * Math.PI) / 2, variant: i % 3 });
    }
  for (const anchor of [0.005, 0.015, 0.035, 0.966, 0.98, 0.995])
    for (const side of [-1, 1]) {
      const p = canyon.routePose(anchor, 'main', side * 13).p;
      p.y = canyon.terrainHeight(p.x, p.z) + 4.6;
      flags.push({
        position: p,
        rotation: canyon.routePose(anchor).yaw,
        scale: new THREE.Vector3(1, 1, 1),
      });
    }
  return { palms, cacti, flags, people };
}
function waterFeatures() {
  const b = new ArtBuilder();
  for (const [t, side, radius] of [
    [0.478, -1, 25],
    [0.513, 1, 30],
    [0.55, -1, 20],
  ]) {
    const pose = canyon.routePose(t, 'main', side * 26),
      water = canyon.routePose(t).p.y - 15;
    b.add(
      new THREE.CylinderGeometry(radius, radius, 0.18, 16),
      '#42b9b1',
      [pose.p.x, water, pose.p.z],
      [1, 1, 0.72],
    );
    b.add(
      new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.1, 13),
      '#259b9e',
      [pose.p.x, water + 0.11, pose.p.z],
      [1, 1, 0.65],
    );
    const falls = canyon.routePose(t, 'main', side * (26 + radius * 0.55)).p,
      top = canyon.terrainHeight(falls.x, falls.z) + 7;
    const h = Math.max(8, top - water);
    b.box([falls.x, water + h / 2, falls.z], [3.8, h, 0.5], '#9bd9c9');
    for (const x of [-1, 1])
      b.box([falls.x + x, water + h / 2, falls.z - 0.3], [0.45, h, 0.09], '#d7e6c2');
    const dock = canyon.routePose(t, 'main', side * 16).p,
      dockY = water + 1;
    for (let i = 0; i < 10; i++)
      b.box([dock.x + i * 0.65, dockY, dock.z], [0.6, 0.2, 5], '#ba955e');
    for (const x of [0, 5])
      for (const z of [-2, 2])
        b.box([dock.x + x, dockY - 1.2, dock.z + z], [0.22, 2.5, 0.22], '#6f6749');
  }
  return b.finish();
}
function tunnelLamps() {
  const b = new ArtBuilder();
  for (const tunnel of canyon.tunnels) {
    const count = Math.ceil(((tunnel.end - tunnel.start) * canyon.TRACK_LENGTH) / 18);
    for (let i = 0; i <= count; i++) {
      const t = tunnel.start + ((tunnel.end - tunnel.start) * i) / count;
      for (const side of [-1, 1]) {
        const p = canyon.routePose(
          t,
          tunnel.route,
          side * (canyon.roadWidthAt(t, tunnel.route) / 2 + 0.75),
        ).p;
        b.box([p.x, p.y + 5.7, p.z], [0.22, 0.55, 0.28], '#ffe1a0');
      }
    }
  }
  return b.finish();
}
function skyAssets() {
  const b = new ArtBuilder();
  for (let i = 0; i < 7; i++) {
    const t = 0.03 + i * 0.15,
      pose = canyon.routePose(t),
      angle = i * 2.4;
    for (let j = 0; j < 4; j++)
      b.add(
        new THREE.IcosahedronGeometry(1, 1),
        j % 2 ? '#d5d6bd' : '#f1e2bf',
        [
          pose.p.x + Math.sin(angle) * 450 + j * 23,
          pose.p.y + 58 + (i % 2) * 9,
          pose.p.z + Math.cos(angle) * 450,
        ],
        [28, 8 + (j % 2) * 4, 18],
        [0, angle, 0],
      );
  }
  for (let i = 0; i < 4; i++) {
    const pose = canyon.routePose(0.59 + i * 0.035, 'main', (i % 2 ? 1 : -1) * (100 + i * 25)),
      p = pose.p.clone();
    p.y += 55 + (i % 2) * 18;
    b.add(
      new THREE.SphereGeometry(1, 10, 7),
      ['#dd8b61', '#52a5a0', '#e8bf6b', '#b67e8d'][i],
      p,
      [8, 11, 8],
    );
    b.add(new THREE.CylinderGeometry(5, 2, 5, 10), '#d8bc7e', [p.x, p.y - 9, p.z]);
    b.box([p.x, p.y - 15, p.z], [3, 2, 3], '#896846');
    for (const side of [-1, 1])
      beamLocal(
        b,
        new THREE.Vector3(p.x + side * 1.3, p.y - 14, p.z),
        new THREE.Vector3(p.x + side * 3, p.y - 10, p.z),
        0.08,
        '#7f7860',
      );
  }
  return b.finish();
}
function beamLocal(b: ArtBuilder, a: THREE.Vector3, c: THREE.Vector3, w: number, color: string) {
  const d = c.clone().sub(a),
    e = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(axis, d.clone().normalize()),
    );
  b.add(
    new THREE.BoxGeometry(w, d.length(), w),
    color,
    a.clone().lerp(c, 0.5),
    [1, 1, 1],
    [e.x, e.y, e.z],
  );
}
function bird() {
  const b = new ArtBuilder();
  b.add(new THREE.IcosahedronGeometry(), '#e7d9b7', [0, 0, 0], [0.2, 0.18, 0.5]);
  b.add(
    new THREE.ConeGeometry(0.1, 0.28, 4),
    '#b88d51',
    [0, 0, -0.55],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  for (const side of [-1, 1])
    b.add(
      new THREE.ConeGeometry(0.25, 1.1, 3),
      '#4d6e63',
      [side * 0.48, 0, 0],
      [1, 1, 0.3],
      [0, 0, side * 0.95],
    );
  return b.finish();
}

function AssetInstances({
  geometry,
  items,
  material,
}: {
  geometry: THREE.BufferGeometry;
  items: CanyonItem[];
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const o = new THREE.Object3D();
    items.forEach((p, i) => {
      o.position.copy(p.position);
      o.scale.copy(p.scale);
      o.rotation.set(0, p.rotation ?? 0, 0);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow />
  );
}
function Chunk({
  geometry,
  center,
  radius,
  material,
}: {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
  radius: number;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.Mesh>(null),
    { camera } = useThree();
  useFrame(() => {
    if (ref.current)
      ref.current.visible =
        (camera.position.x - center.x) ** 2 + (camera.position.z - center.z) ** 2 < radius * radius;
  });
  return <mesh ref={ref} geometry={geometry} material={material} castShadow receiveShadow />;
}
export function CanyonScenery({ qualityKey = 'high' }: { qualityKey?: string }) {
  const reduced = useGame(
      (s) => s.save.settings.reducedMotion || s.save.settings.effects === 'low',
    ),
    time = useRef(0),
    cloud = useRef<THREE.Mesh>(null),
    peopleRefs = useRef<(THREE.InstancedMesh | null)[]>([]),
    birdRef = useRef<THREE.InstancedMesh>(null),
    trail = useRef<THREE.InstancedMesh>(null),
    confetti = useRef<THREE.InstancedMesh>(null),
    boostGlow = useRef<THREE.MeshBasicMaterial>(null);
  const data = useMemo(() => vegetation(), []),
    chunks = useMemo(() => buildCanyonChunks(), []),
    assets = useMemo(
      () => [
        makeCanyonPalm(),
        makeCactus(),
        personGeometry(0),
        personGeometry(1),
        personGeometry(2),
        bird(),
        new THREE.BoxGeometry(),
        new THREE.PlaneGeometry(0.2, 0.65),
        new THREE.PlaneGeometry(1.4, 1.1, 10, 4),
      ],
      [],
    );
  const staticAssets = useMemo(
      () => [
        paintGeometry(),
        archGeometry(data.flags),
        waterFeatures(),
        skyAssets(),
        tunnelLamps(),
      ],
      [],
    ),
    pads = useMemo(() => boostPaint(), []),
    material = useMemo(
      () =>
        new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
      [],
    ),
    object = useMemo(() => new THREE.Object3D(), []),
    right = useMemo(() => new THREE.Vector3(), []),
    birdsAt = useMemo(
      () => Array.from({ length: 6 }, (_, i) => canyon.routePose(i < 3 ? 0.49 : 0.655).p),
      [],
    ),
    finish = useMemo(() => canyon.routePose(1), []),
    start = useMemo(() => canyon.routePose(0), []);
  useEffect(
    () => () => {
      chunks.forEach((c) => c.geometry.dispose());
      assets.forEach((g) => g.dispose());
      staticAssets.forEach((g) => g.dispose());
      pads.base.dispose();
      pads.chevrons.dispose();
      material.dispose();
    },
    [chunks, assets, staticAssets, pads, material],
  );
  useFrame((_, dt) => {
    if (!reduced && race.phase !== 'PAUSED') time.current += dt;
    const t = time.current;
    if (cloud.current) cloud.current.position.x = Math.sin(t * 0.002) * 16;
    for (let variant = 0; variant < 3; variant++) {
      let index = 0;
      for (let i = 0; i < data.people.length; i++) {
        const p = data.people[i];
        if (p.variant !== variant) continue;
        object.position.copy(p.p);
        object.position.y += reduced ? 0 : Math.sin(t * 1.3 + i) * 0.025;
        object.rotation.set(0, p.yaw, reduced ? 0 : Math.sin(t * 0.7 + i) * 0.025);
        object.scale.setScalar(1);
        object.updateMatrix();
        peopleRefs.current[variant]?.setMatrixAt(index++, object.matrix);
      }
      if (peopleRefs.current[variant])
        peopleRefs.current[variant]!.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < 6; i++) {
      const p = birdsAt[i],
        a = t * 0.07 + i * 1.7;
      object.position.set(p.x + Math.sin(a) * 35, p.y + 14 + (i % 3) * 3, p.z + Math.cos(a) * 30);
      object.rotation.set(Math.sin(t * 3 + i) * 0.1, a - Math.PI / 2, Math.sin(t * 3 + i) * 0.15);
      object.scale.setScalar(1.3);
      object.updateMatrix();
      birdRef.current?.setMatrixAt(i, object.matrix);
    }
    if (birdRef.current) birdRef.current.instanceMatrix.needsUpdate = true;
    if (boostGlow.current)
      boostGlow.current.opacity =
        telemetry.boostRemaining > 0 ? 0.8 + Math.sin(t * 10) * 0.15 : 0.72;
    if (trail.current) {
      trail.current.visible = !reduced && race.phase === 'RACING' && telemetry.boostRemaining > 0;
      right.set(-carForward.z, 0, carForward.x);
      for (let i = 0; i < 6; i++) {
        object.position
          .copy(carPosition)
          .addScaledVector(carForward, -2.7 - Math.floor(i / 2) * 1.6)
          .addScaledVector(right, i % 2 ? 0.8 : -0.8);
        object.position.y += 0.15;
        object.rotation.set(0, Math.atan2(-carForward.x, -carForward.z), 0);
        object.scale.set(0.05, 0.035, 1.25);
        object.updateMatrix();
        trail.current.setMatrixAt(i, object.matrix);
      }
      trail.current.instanceMatrix.needsUpdate = true;
    }
    if (confetti.current) {
      const active =
        !reduced &&
        race.finishTime !== null &&
        ['FINISHING', 'RESULTS'].includes(race.phase) &&
        race.finishElapsed < 4;
      confetti.current.visible = active;
      if (active) {
        const pose = finish,
          e = race.finishElapsed;
        for (let i = 0; i < 24; i++) {
          object.position.set(
            pose.p.x + Math.sin(i * 2.4 + e) * 9,
            pose.p.y + 9 + (i % 7) * 0.4 - e * 2,
            pose.p.z + Math.cos(i * 2.4) * 4,
          );
          object.rotation.set(e + i, e * 0.7 + i, Math.sin(e + i));
          object.scale.setScalar(1);
          object.updateMatrix();
          confetti.current.setMatrixAt(i, object.matrix);
        }
        confetti.current.instanceMatrix.needsUpdate = true;
      }
    }
  });
  const radius = qualityKey === 'low' ? 500 : qualityKey === 'medium' ? 700 : 900;
  return (
    <group name="canyon-carnival-rich-world">
      {chunks.map((c, i) => (
        <Chunk
          key={i}
          geometry={c.geometry}
          center={c.center}
          radius={radius}
          material={material}
        />
      ))}
      <mesh geometry={staticAssets[0]} renderOrder={2}>
        <meshStandardMaterial
          vertexColors
          roughness={1}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh geometry={staticAssets[1]} material={material} castShadow receiveShadow />
      <mesh geometry={staticAssets[2]} material={material} receiveShadow />
      <mesh geometry={staticAssets[4]}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh ref={cloud} geometry={staticAssets[3]} material={material} />
      <mesh geometry={pads.base} material={material} />
      <mesh geometry={pads.chevrons} renderOrder={3}>
        <meshBasicMaterial
          ref={boostGlow}
          vertexColors
          transparent
          opacity={0.8}
          toneMapped={false}
        />
      </mesh>
      <AssetInstances items={data.palms} geometry={assets[0]} material={material} />
      <AssetInstances
        items={data.cacti.filter((_, i) => (qualityKey === 'low' ? i % 2 === 0 : true))}
        geometry={assets[1]}
        material={material}
      />
      {[0, 1, 2].map((v) => (
        <instancedMesh
          key={v}
          ref={(m) => {
            peopleRefs.current[v] = m;
          }}
          args={[assets[2 + v], material, data.people.filter((p) => p.variant === v).length]}
          frustumCulled={false}
          castShadow
        />
      ))}
      <instancedMesh ref={birdRef} args={[assets[5], material, 6]} frustumCulled={false} />
      <instancedMesh
        args={[assets[8], undefined, data.flags.length]}
        ref={(mesh) => {
          if (!mesh) return;
          const o = new THREE.Object3D();
          data.flags.forEach((p, i) => {
            o.position.copy(p.position);
            o.rotation.set(0, p.rotation ?? 0, 0);
            o.updateMatrix();
            mesh.setMatrixAt(i, o.matrix);
          });
          mesh.instanceMatrix.needsUpdate = true;
        }}
      >
        <WindMaterial color="#e4ba65" flag />
      </instancedMesh>
      <instancedMesh ref={trail} args={[assets[6], undefined, 6]} frustumCulled={false}>
        <meshBasicMaterial
          color="#65fff1"
          transparent
          opacity={0.5}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={confetti} args={[assets[7], undefined, 24]} frustumCulled={false}>
        <meshBasicMaterial color="#f6cf6b" side={THREE.DoubleSide} />
      </instancedMesh>
      {[0, 1].map((t, i) => {
        const pose = i ? finish : start;
        return (
          <group key={t} position={pose.p} rotation={[0, pose.yaw, 0]}>
            <TrackLabel
              text={i ? 'APEX / CANYON FINISH' : 'APEX / CANYON CARNIVAL'}
              position={[0, 13.7, 0.98]}
              width={16.8}
              height={1.1}
            />
            {!i && (
              <group position={[0, 1.25, 0]}>
                <StartingLights />
              </group>
            )}
          </group>
        );
      })}
      {canyon.sections.slice(1).map((section) => {
        const pose = canyon.routePose(section.start, 'main', 13);
        return (
          <group key={section.name} position={pose.p} rotation={[0, pose.yaw, 0]}>
            <TrackLabel
              text={section.name.toUpperCase()}
              position={[0, 4.4, 0]}
              width={6.4}
              height={1}
            />
            <mesh position={[0, 2, 0]}>
              <boxGeometry args={[0.18, 4, 0.18]} />
              <meshStandardMaterial color="#d4bb83" />
            </mesh>
          </group>
        );
      })}
      {canyon.branches.map((branch) => {
        const side = Math.sign(branch.offset),
          pose = canyon.routePose(branch.start - 0.006, 'main', side * 13);
        const text =
          (
            {
              cliff: 'CLIFF / PRECISION  ←',
              mine: 'MINE / BOOST  ←',
              waterside: 'WATERSIDE / FLOW  ←',
              switchbacks: 'SWITCHBACKS / SAFE  ←',
            } as Record<string, string>
          )[branch.id] ?? 'ALTERNATE ROUTE';
        return (
          <group key={branch.id} position={pose.p} rotation={[0, pose.yaw, 0]}>
            <TrackLabel text={text} position={[0, 4, 0]} width={6.2} height={1.1} />
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[0.18, 3.6, 0.18]} />
              <meshStandardMaterial color="#d8bd87" />
            </mesh>
          </group>
        );
      })}
      {canyon.jumps.map((j) => {
        const pose = canyon.routePose(
          j.t - 0.006,
          j.route,
          canyon.roadWidthAt(j.t, j.route) / 2 + 2.5,
        );
        return (
          <group key={j.id} position={pose.p} rotation={[0, pose.yaw, 0]}>
            <TrackLabel
              text={
                j.id === 'eagles-leap'
                  ? "EAGLE'S LEAP / LEFT RAMP · RIGHT SAFE"
                  : 'OPTIONAL RAMP / KEEP RIGHT FOR LEVEL'
              }
              position={[0, 2.9, 0]}
              width={5.6}
              height={0.8}
            />
            <mesh position={[0, 1.3, 0]}>
              <boxGeometry args={[0.13, 2.6, 0.13]} />
              <meshStandardMaterial color="#e4c58b" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
