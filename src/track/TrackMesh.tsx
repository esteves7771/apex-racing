import { continuousRail, forestTerrainTint } from './RoadArt';
import { ForestWorld } from './WorldDetails';
import { useMemo } from 'react';
import { Instances } from './InstancedProps';
import { EvolutionScenery, TrackLabel } from './EvolutionScenery';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { GroundColliders } from './GroundColliders';
import {
  samples,
  ribbon,
  palette,
  nearestTrack,
  poseAt,
  checkpoints,
  terrainHeight,
  terrainGeometry,
  roadHeight,
  shoulderGeometry,
} from './PineValley';
const road = ribbon(-6, 6, 0.035),
  verge = ribbon(-7.25, -6, 0.018),
  vergeRight = ribbon(6, 7.25, 0.018),
  shoulderLeft = shoulderGeometry(-1),
  shoulderRight = shoulderGeometry(1),
  terrain = terrainGeometry();
const forestFloor = forestTerrainTint(terrain);
const concreteWall = continuousRail({ samples, roadHeight }, 7.5, 0.68, 1.3, 0.65);
export const barriers = samples
  .filter((_, i) => i % 3 === 0)
  .flatMap((s, i) =>
    [-1, 1].map((side) => {
      const next = samples[((i + 1) * 3) % samples.length],
        a = s.p.clone().addScaledVector(s.side, side * 7.5),
        b = next.p.clone().addScaledVector(next.side, side * 7.5),
        d = b.clone().sub(a);
      const p = a.clone().add(b).multiplyScalar(0.5);
      p.y = roadHeight(s.t, side * 7.5) - 0.035;
      return { p, yaw: Math.atan2(d.x, d.z), length: d.length() + 0.18 };
    }),
  );
const box = new THREE.BoxGeometry(1, 1, 1),
  rock = new THREE.DodecahedronGeometry(1, 0);
let seed = 98;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const trees = Array.from({ length: 110 }, () => {
  let x = 0,
    z = 0;
  do {
    const centers = [
      [-45, 40],
      [70, -165],
      [105, 75],
      [350, 15],
      [205, 245],
      [40, 265],
      [-60, 190],
    ];
    const center = centers[Math.floor(random() * centers.length)];
    x = center[0] + (random() + random() - 1) * 65;
    z = center[1] + (random() + random() - 1) * 65;
  } while (nearestTrack(x, z).distance < 20);
  return { x, z, size: 0.8 + random() * 1.1 };
});
const rocks = trees
  .filter((_, i) => i % 4 === 0)
  .map((t) => ({
    position: new THREE.Vector3(t.x + 4, terrainHeight(t.x + 4, t.z + 3) + 0.6, t.z + 3),
    scale: new THREE.Vector3(1.9, 1.3, 1.5),
    rotation: t.x,
  }));
export function TrackMesh({ preset = 'high' }: { preset?: string }) {
  const curbs = useMemo(
    () =>
      samples.flatMap((s, i) =>
        [-1, 1].map((side) => {
          const p = s.p.clone().addScaledVector(s.side, side * 6.45);
          p.y = roadHeight(s.t, side * 6.45) + 0.045;
          return {
            position: p,
            scale: new THREE.Vector3(
              0.9,
              0.12,
              s.p.distanceTo(samples[(i + 1) % samples.length].p) + 0.08,
            ),
            rotation: Math.atan2(s.tangent.x, s.tangent.z),
            coral: Math.floor(i / 3) % 2 === 0,
          };
        }),
      ),
    [],
  );
  const start = poseAt(0);
  return (
    <>
      <mesh geometry={forestFloor} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        {barriers.map((b, i) => (
          <CuboidCollider
            key={i}
            position={[b.p.x, b.p.y + 0.65, b.p.z]}
            rotation={[0, b.yaw, 0]}
            args={[0.34, 0.65, b.length / 2]}
            friction={0.12}
            restitution={0.1}
          />
        ))}
      </RigidBody>
      <GroundColliders road={road} terrain={terrain} />
      <EvolutionScenery />
      <mesh geometry={verge} receiveShadow>
        <meshStandardMaterial color="#7ba776" />
      </mesh>
      <mesh geometry={vergeRight} receiveShadow>
        <meshStandardMaterial color="#7ba776" />
      </mesh>
      <mesh geometry={shoulderLeft} receiveShadow>
        <meshStandardMaterial color={palette.grass} />
      </mesh>
      <mesh geometry={shoulderRight} receiveShadow>
        <meshStandardMaterial color={palette.grass} />
      </mesh>
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial color={palette.road} roughness={0.97} />
      </mesh>
      <Instances geometry={box} color={palette.coral} items={curbs.filter((c) => c.coral)} />
      <Instances geometry={box} color={palette.cream} items={curbs.filter((c) => !c.coral)} />
      <mesh geometry={concreteWall} receiveShadow>
        <meshStandardMaterial color={palette.barrier} roughness={0.85} />
      </mesh>
      <ForestWorld preset={preset} />
      <Instances geometry={rock} color="#96ac9b" items={rocks} />
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          position={[Math.cos(i * 2.4) * 510 + 120, 6, Math.sin(i * 2.4) * 470 + 50]}
          scale={[90, 35 + (i % 3) * 13, 75]}
        >
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={i % 2 ? '#79b69b' : '#93c8ac'} flatShading />
        </mesh>
      ))}
      <group position={[start.p.x, start.p.y, start.p.z]} rotation={[0, start.yaw, 0]}>
        <TrackLabel
          text="APEX  /  PINE VALLEY"
          position={[0, 6.02, 0.46]}
          width={6.4}
          height={0.6}
        />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 6.9, 0, 0]}>
            <mesh position={[0, 3, 0]} castShadow>
              <boxGeometry args={[0.7, 6, 0.8]} />
              <meshStandardMaterial color={palette.coral} />
            </mesh>
            <mesh position={[0, 1, 0]}>
              <boxGeometry args={[0.8, 1.7, 0.9]} />
              <meshStandardMaterial color={palette.cream} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 6, 0]} castShadow>
          <boxGeometry args={[14.5, 1, 0.8]} />
          <meshStandardMaterial color={palette.coral} />
        </mesh>
        <mesh position={[0, 6.02, -0.42]}>
          <boxGeometry args={[7, 0.54, 0.03]} />
          <meshStandardMaterial color={palette.cream} />
        </mesh>
        {Array.from({ length: 24 }, (_, i) => (
          <mesh
            key={i}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(i % 12) - 5.5, 0.06, Math.floor(i / 12) - 0.5]}
          >
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial color={(i + Math.floor(i / 12)) % 2 ? '#f4eee0' : '#242f37'} />
          </mesh>
        ))}
        <group position={[-17, 0, -18]}>
          <mesh position={[0, 3.2, 0]} castShadow>
            <coneGeometry args={[6, 1.6, 4]} />
            <meshStandardMaterial color={palette.coral} />
          </mesh>
          {[-3, 3].flatMap((x) =>
            [-3, 3].map((z) => (
              <mesh key={`${x},${z}`} position={[x, 1.5, z]}>
                <boxGeometry args={[0.15, 3, 0.15]} />
                <meshStandardMaterial color={palette.cream} />
              </mesh>
            )),
          )}
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[4, 1.6, 2]} />
            <meshStandardMaterial color="#d9ead6" />
          </mesh>
        </group>
      </group>
      {checkpoints.slice(1).map((cp, i) => (
        <group key={i} position={[cp.p.x, cp.p.y, cp.p.z]} rotation={[0, cp.yaw, 0]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 8.3, 0, 0]}>
              <mesh position={[0, 2.1, 0]}>
                <boxGeometry args={[0.12, 4.2, 0.12]} />
                <meshStandardMaterial color="#e7eef0" />
              </mesh>
              <mesh position={[0, 3.3, 0]} rotation={[0, 0, -0.18]}>
                <boxGeometry args={[1, 1.4, 0.07]} />
                <meshStandardMaterial color={i % 2 ? palette.cream : palette.coral} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </>
  );
}
