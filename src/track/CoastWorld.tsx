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
const asphalt = coast.ribbon(-6, 6, 0.045),
  leftLine = coast.ribbon(-5.8, -5.6, 0.055),
  rightLine = coast.ribbon(5.6, 5.8, 0.055);
export const coastBarriers = coast.samples
  .filter((_, i) => i % 5 === 0)
  .flatMap((s, i) =>
    [-1, 1].map((side) => {
      const next = coast.samples[((i + 1) * 5) % coast.SEGMENTS],
        a = s.p.clone().addScaledVector(s.side, 7.6 * side),
        b = next.p.clone().addScaledVector(next.side, 7.6 * side),
        d = b.clone().sub(a),
        p = a.clone().add(b).multiplyScalar(0.5);
      p.y = coast.roadHeight(s.t, side * 7.6);
      return { p, yaw: Math.atan2(d.x, d.z), length: d.length() + 0.22 };
    }),
  );
const rails = coastBarriers.map((b) => ({
  position: b.p.clone().add(new THREE.Vector3(0, 0.85, 0)),
  scale: new THREE.Vector3(0.32, 0.75, b.length),
  rotation: b.yaw,
}));
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
  const g = coast.ribbon(side < 0 ? -6.8 : 6, side < 0 ? -6 : 6.8, 0.052),
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
      <mesh geometry={coastRoad} receiveShadow>
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
      <CoastArt />
      <RaceVenue />
      <Instances items={rails} geometry={box} color="#e9dcb6" />
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
