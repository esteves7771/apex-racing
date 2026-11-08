import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as coast from './CoralCoast';
import { Instances } from './InstancedProps';
import { carPosition } from '../vehicle/ArcadeVehicleController';
import { FRAME_ORDER } from '../render/frameOrder';
const box = new THREE.BoxGeometry();
function archDetails() {
  const p: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  for (const [number, tunnel] of coast.tunnels.entries()) {
    const length = (tunnel.end - tunnel.start) * coast.TRACK_LENGTH,
      count = Math.ceil(length / 20);
    for (let i = 0; i <= count; i++) {
      const center = tunnel.start + ((tunnel.end - tunnel.start) * i) / count,
        offset = p.length / 3;
      for (const dt of [-0.00005, 0.00005]) {
        const t = center + dt,
          q = coast.poseAt(t).p,
          d = coast.curve.getTangentAt(t);
        for (let j = 0; j <= 12; j++) {
          const angle = (j * Math.PI) / 12,
            w = Math.cos(angle) * 7.28;
          p.push(q.x - d.z * w, q.y + Math.sin(angle) * (tunnel.height - 0.09), q.z + d.x * w);
          const c = new THREE.Color(number ? '#ddcfac' : '#9bb4af');
          colors.push(c.r, c.g, c.b);
        }
      }
      for (let j = 0; j < 12; j++) {
        const a = offset + j,
          b = a + 13;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const ribs = archDetails();
function outerRock() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (const [index, tunnel] of coast.tunnels.entries()) {
    const count = Math.ceil(((tunnel.end - tunnel.start) * coast.TRACK_LENGTH) / 6),
      offset = positions.length / 3;
    for (let i = 0; i <= count; i++) {
      const t = tunnel.start + ((tunnel.end - tunnel.start) * i) / count,
        p = coast.poseAt(t).p,
        d = coast.curve.getTangentAt(t);
      for (let j = 0; j <= 12; j++) {
        const a = (j * Math.PI) / 12,
          w = Math.cos(a) * (11.5 + 0.4 * Math.sin(i * 1.7 + j)),
          y = Math.sin(a) * (11 + 0.6 * Math.sin(i * 0.7 + j * 2)) - 1.5 * (1 - Math.sin(a));
        positions.push(p.x - d.z * w, p.y + y, p.z + d.x * w);
        const c = new THREE.Color(index ? '#c2b99f' : '#94a59d');
        c.multiplyScalar(0.82 + 0.18 * Math.sin(i * 0.8 + j * 1.4));
        colors.push(c.r, c.g, c.b);
      }
      if (i < count)
        for (let j = 0; j < 12; j++) {
          const a = offset + i * 13 + j,
            b = a + 13;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    for (const i of [0, count]) {
      const t = i === 0 ? tunnel.start : tunnel.end,
        p = coast.poseAt(t).p,
        d = coast.curve.getTangentAt(t),
        start = positions.length / 3;
      for (let j = 0; j <= 12; j++) {
        const a = (j * Math.PI) / 12,
          w = Math.cos(a) * 7.4;
        positions.push(p.x - d.z * w, p.y + Math.sin(a) * tunnel.height, p.z + d.x * w);
        const c = new THREE.Color(index ? '#cfc3a6' : '#9fae9f');
        colors.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < 12; j++) {
        const outer = offset + i * 13 + j,
          inner = start + j;
        indices.push(outer, inner, outer + 1, outer + 1, inner, inner + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const rockCover = outerRock();
const lamps = coast.tunnels.flatMap((v, index) =>
  Array.from({ length: Math.floor(((v.end - v.start) * coast.TRACK_LENGTH) / 12) }, (_, i) =>
    [-1, 1].map((side) => {
      const t = v.start + ((i + 0.4) * 12) / coast.TRACK_LENGTH,
        p = coast.poseAt(t).p,
        d = coast.curve.getTangentAt(t);
      return {
        index,
        position: p.add(new THREE.Vector3(-d.z * side * 6.5, 2.8, d.x * side * 6.5)),
        scale: new THREE.Vector3(0.4, 0.7, 0.4),
        rotation: coast.poseAt(t).yaw,
      };
    }),
  ).flat(),
);
const guidePosts = coast.tunnels.flatMap((v) =>
  Array.from({ length: Math.ceil(((v.end - v.start) * coast.TRACK_LENGTH) / 4) }, (_, i) =>
    [-1, 1].map((side) => {
      const t = v.start + ((i + 0.2) * 4) / coast.TRACK_LENGTH,
        p = coast.poseAt(t).p,
        d = coast.curve.getTangentAt(t);
      return {
        position: p.add(new THREE.Vector3(-d.z * side * 5.9, 0.22, d.x * side * 5.9)),
        scale: new THREE.Vector3(0.14, 0.12, 0.55),
        rotation: coast.poseAt(t).yaw,
      };
    }),
  ).flat(),
);
export function CoastTunnels({ shell }: { shell: THREE.BufferGeometry }) {
  const tinted = useMemo(() => {
    const g = shell.clone(),
      p = g.getAttribute('position'),
      colors = [],
      first =
        (Math.ceil(((coast.tunnels[0].end - coast.tunnels[0].start) * coast.TRACK_LENGTH) / 3) +
          1) *
        13;
    for (let i = 0; i < p.count; i++) {
      const c = new THREE.Color(i < first ? '#8c9e9c' : '#d1c5a7');
      c.multiplyScalar(0.86 + 0.14 * Math.sin(Math.floor(i / 13) * 1.7 + (i % 13)));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [shell]);
  useEffect(() => () => tinted.dispose(), [tinted]);
  const fill = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (!fill.current) return;
    const n = coast.nearestTrack(carPosition.x, carPosition.z),
      inside = coast.tunnelAt(n.t, 0.002);
    fill.current.intensity = inside ? 65 : 0;
    fill.current.position.copy(carPosition).add(new THREE.Vector3(0, 3, 0));
  }, FRAME_ORDER.lighting);
  return (
    <group name="coral-tunnel-art">
      <mesh geometry={rockCover} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} roughness={1} />
      </mesh>
      <mesh geometry={tinted} receiveShadow castShadow>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.95}
          emissive="#618484"
          emissiveIntensity={0.34}
          flatShading
        />
      </mesh>
      <mesh geometry={ribs}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          emissive="#547571"
          emissiveIntensity={0.35}
          roughness={0.9}
        />
      </mesh>
      <Instances
        items={lamps.filter((v) => v.index === 0)}
        geometry={box}
        color="#ffde9b"
        shadow={false}
        unlit
      />
      <Instances
        items={lamps.filter((v) => v.index === 1)}
        geometry={box}
        color="#c1e6d8"
        shadow={false}
        unlit
      />
      <Instances items={guidePosts} geometry={box} color="#ead6a4" shadow={false} />
      <pointLight ref={fill} color="#ffe1b2" intensity={0} distance={32} decay={2} />
    </group>
  );
}
