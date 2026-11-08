import { coastEdgePoint, coastArtTrack, edgeRibbon } from './CoastEdges';
import { landSection } from './CoastLandscape';
import { continuousRail, bridgeDeck } from './RoadArt';
import { TropicalWorld } from './WorldDetails';
import { shaderSnapshot } from '../render/ShaderWarmup';
import { useLayoutEffect, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import * as coast from './CoralCoast';
import { Instances } from './InstancedProps';
import { GroundColliders, createGroundCollider } from './GroundColliders';
import { TrackLabel } from './EvolutionScenery';
import { CoastArt } from './CoastArt';
import { CoastTunnels } from './CoastTunnels';
import { RaceVenue } from './RaceVenue';
const box = new THREE.BoxGeometry();
export const coastRoad = coast.ribbon(-7.25, 7.25, 0.035),
  coastTerrain = coast.terrainGeometry();
const visualShoulder = edgeRibbon(-7.25, 7.25, 0.035);
const asphalt = edgeRibbon(-6, 6, 0.045),
  leftLine = edgeRibbon(-5.8, -5.6, 0.055),
  rightLine = edgeRibbon(5.6, 5.8, 0.055);
export const coastBarriers = coast.samples.flatMap((s, i) => {
  const local = i >= 1620 && i < 1710;
  if (!local && i % 5 !== 0) return [];
  const next = coast.samples[(i + (local ? 1 : 5)) % coast.SEGMENTS];
  return [-1, 1].flatMap((side) => {
    const a = coastEdgePoint(s.t, 7.6 * side),
      b = coastEdgePoint(next.t, 7.6 * side),
      d = b.clone().sub(a);
    if (d.length() < 0.05) return [];
    const p = a.clone().add(b).multiplyScalar(0.5);
    p.y = coast.roadHeight(s.t, side * 7.6);
    return [{ p, yaw: Math.atan2(d.x, d.z), length: d.length() + (local ? 0.02 : 0.22) }];
  });
});
const deck = bridgeDeck(coastArtTrack, (t) => !landSection(t));
const railSurface = continuousRail(
  coastArtTrack,
  7.6,
  0.3,
  0.22,
  0.95,
  (t) => !!coast.tunnelAt(t, 0.003),
);
const railLow = continuousRail(
  coastArtTrack,
  7.6,
  0.18,
  0.14,
  0.42,
  (t) => !!coast.tunnelAt(t, 0.003),
);
const rawEdgePosts = coast.samples
  .filter((s, i) => i % 4 === 0 && !coast.tunnelAt(s.t, 0.003))
  .flatMap((s) =>
    [-1, 1].map((side) => ({
      position: coastEdgePoint(s.t, side * 7.6).setY(coast.roadHeight(s.t, side * 7.6) + 0.5),
      scale: new THREE.Vector3(0.16, 1, 0.18),
      rotation: coast.poseAt(s.t).yaw,
    })),
  );
const edgePosts = [
  ...new Map(
    rawEdgePosts.map((p) => [
      p.position
        .toArray()
        .map((x) => x.toFixed(4))
        .join(','),
      p,
    ]),
  ).values(),
];
const warning = coastEdgePoint(0.918, -11);
warning.y = coast.roadHeight(0.918);
export function tunnelGeometry() {
  const positions: number[] = [],
    indices: number[] = [];
  for (const tunnel of coast.tunnels) {
    const count = Math.ceil(((tunnel.end - tunnel.start) * coast.TRACK_LENGTH) / 3),
      start = positions.length / 3;
    for (let i = 0; i <= count; i++) {
      const t = tunnel.start + ((tunnel.end - tunnel.start) * i) / count,
        p = coast.poseAt(t).p,
        d = coast.curve.getTangentAt(t);
      for (let j = 0; j <= 12; j++) {
        const a = (j / 12) * Math.PI,
          w = Math.cos(a) * 7.4;
        positions.push(p.x - d.z * w, p.y + Math.sin(a) * tunnel.height, p.z + d.x * w);
      }
      if (i < count)
        for (let j = 0; j < 12; j++) {
          const a = start + i * 13 + j,
            b = a + 13;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export const cavern = tunnelGeometry();
function TunnelCollider() {
  const { world } = useRapier();
  useLayoutEffect(() => {
    const c = createGroundCollider(world, cavern);
    return () => {
      if (c.isValid()) world.removeCollider(c, true);
    };
  }, [world]);
  return null;
}
function paintedKerb(side: number) {
  const g = edgeRibbon(side < 0 ? -6.8 : 6, side < 0 ? -6 : 6.8, 0.052),
    p = g.getAttribute('position'),
    colors = [];
  const a = new THREE.Color('#ed886e'),
    b = new THREE.Color('#fff2cd');
  for (let i = 0; i < p.count; i++) {
    const c = Math.floor(i / 3 / 3) % 2 ? a : b;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
const kerbs = [paintedKerb(-1), paintedKerb(1)];

function PrepareCoastShaders({ qualityKey }: { qualityKey: string }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let mounted = true;
    const start = performance.now();
    scene.userData.coastShaderPreparation = { status: 'preparing' };
    // Prepare off-screen materials during selection/countdown, before their first racing view.
    // Three uses parallel compilation support; shader diagnostics remain enabled.
    const preparation = shaderSnapshot(scene);
    void gl
      .compileAsync(preparation.scene, camera)
      .then(() => {
        if (mounted)
          scene.userData.coastShaderPreparation = {
            status: 'ready',
            milliseconds: performance.now() - start,
          };
      })
      .catch((error) => console.error('Coral shader preparation failed', error))
      .finally(() => preparation.dispose());
    return () => {
      mounted = false;
    };
  }, [gl, scene, camera, qualityKey]);
  return null;
}
export function CoastWorld({ qualityKey = 'high' }: { qualityKey?: string }) {
  return (
    <>
      <PrepareCoastShaders qualityKey={qualityKey} />
      <GroundColliders road={coastRoad} terrain={coastTerrain} />
      <TunnelCollider />
      <mesh geometry={visualShoulder} receiveShadow>
        <meshStandardMaterial color="#e5bd81" roughness={1} />
      </mesh>
      <mesh geometry={asphalt} receiveShadow>
        <meshStandardMaterial color="#394652" roughness={0.9} />
      </mesh>
      {[leftLine, rightLine].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial color="#fff0c7" />
        </mesh>
      ))}
      {kerbs.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} />
        </mesh>
      ))}
      <CoastTunnels shell={cavern} />
      <CoastArt preset={qualityKey} />
      <TropicalWorld preset={qualityKey} />
      <mesh geometry={deck} receiveShadow>
        <meshStandardMaterial color="#c6c2a9" roughness={0.9} />
      </mesh>
      <RaceVenue />
      <group position={warning} rotation={[0, coast.poseAt(0.918).yaw, 0]}>
        <TrackLabel text="TIGHT TURN / SLOW" position={[0, 2.7, 0]} width={4} height={0.8} />
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[0.12, 2.6, 0.12]} />
          <meshStandardMaterial color="#e9dcb6" />
        </mesh>
      </group>
      <mesh geometry={railSurface} receiveShadow>
        <meshStandardMaterial color="#eadfc0" roughness={0.65} />
      </mesh>
      <mesh geometry={railLow}>
        <meshStandardMaterial color="#c1c6ad" roughness={0.7} />
      </mesh>
      <Instances items={edgePosts} geometry={box} color="#a8b2a2" shadow={false} />
      <RigidBody type="fixed" colliders={false}>
        {coastBarriers.map((b, i) => (
          <CuboidCollider
            key={i}
            args={[0.18, 0.8, b.length / 2]}
            position={[b.p.x, b.p.y + 0.8, b.p.z]}
            rotation={[0, b.yaw, 0]}
            friction={0.12}
            restitution={0.1}
          />
        ))}
      </RigidBody>
      {coast.trackFeatures.landmarks.map((v) => {
        const p = coast.poseAt(v.t);
        return (
          <group key={v.name} position={p.p} rotation={[0, p.yaw, 0]}>
            <TrackLabel
              position={[-11, 4.7, 0]}
              text={v.name.toUpperCase()}
              width={7}
              height={0.8}
            />
            <mesh position={[-11, 2.2, 0]}>
              <boxGeometry args={[0.18, 4.4, 0.18]} />
              <meshStandardMaterial color="#e9dcb6" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
