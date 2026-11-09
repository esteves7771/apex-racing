import { useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CuboidCollider, ConvexHullCollider, RigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import * as canyon from './CanyonCarnival';
import {
  roadGeometry,
  terrainGeometry,
  barriers,
  solidObstacles,
  routePose,
} from './CanyonCarnival';
import { GroundColliders, createGroundCollider } from './GroundColliders';
import { Instances } from './InstancedProps';
import { canyonTunnelGeometry } from './CanyonStructures';
import { ArtBuilder } from './ArtAssets';
import { audioManager } from '../audio/AudioManager';
import { race } from '../game/store';
import { CanyonScenery } from './CanyonScenery';
import { shaderSnapshot } from '../render/ShaderWarmup';

function PrepareCanyonShaders({ qualityKey }: { qualityKey: string }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let mounted = true;
    const preparation = shaderSnapshot(scene);
    preparation.scene.traverse((object) => {
      object.visible = true;
    });
    const start = performance.now();
    scene.userData.canyonShaderPreparation = { status: 'preparing' };
    void gl
      .compileAsync(preparation.scene, camera)
      .then(() => {
        if (mounted)
          scene.userData.canyonShaderPreparation = {
            status: 'ready',
            milliseconds: performance.now() - start,
          };
      })
      .catch((error) => console.error('Canyon shader preparation failed', error))
      .finally(() => preparation.dispose());
    return () => {
      mounted = false;
    };
  }, [gl, scene, camera, qualityKey]);
  return null;
}

function TunnelContact({ geometry }: { geometry: THREE.BufferGeometry }) {
  const { world } = useRapier();
  useLayoutEffect(() => {
    const collider = createGroundCollider(world, geometry);
    return () => {
      if (collider.isValid()) world.removeCollider(collider, true);
    };
  }, [world, geometry]);
  return null;
}

function SolidObstacles() {
  const impacts = useRef(new Map<string, number>());
  const impactRun = useRef(-1);
  const geometries = useMemo(
    () =>
      solidObstacles.map((o, i) => {
        if (i % 2) return new THREE.DodecahedronGeometry(o.radius).scale(1, 1.1, 1);
        const b = new ArtBuilder(),
          r = o.radius;
        b.box([0, 0.8 * r, 0], [r * 2, 0.6 * r, r * 2], '#705347');
        b.box([0, 1.14 * r, 0], [r * 1.75, 0.12 * r, r * 1.75], '#4f4040');
        for (const side of [-1, 1])
          for (const end of [-1, 1])
            b.add(
              new THREE.CylinderGeometry(0.26 * r, 0.26 * r, 0.16 * r, 8),
              '#2f3438',
              [side * 0.85 * r, 0.3 * r, end * 0.65 * r],
              [1, 1, 1],
              [0, 0, Math.PI / 2],
            );
        return b.finish();
      }),
    [],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <group name="canyon-authoritative-solid-obstacles">
      {solidObstacles.map((o, i) => {
        const pose = routePose(o.t, o.route, o.lateral),
          p = pose.p.clone();
        p.y += i % 2 ? o.radius * 1.1 : 0.035;
        const geometry = geometries[i];
        return (
          <RigidBody
            key={o.id}
            type="fixed"
            colliders={false}
            position={p}
            rotation={[0, pose.yaw, 0]}
            userData={{ kind: 'canyon-solid', id: o.id }}
            onCollisionEnter={(event) => {
              if (impactRun.current !== race.runId) {
                impactRun.current = race.runId;
                impacts.current.clear();
              }
              const kind = (event.other.rigidBody?.userData as { kind?: string })?.kind;
              const now = performance.now() / 1000;
              if (
                kind === 'car' &&
                race.phase === 'RACING' &&
                now - (impacts.current.get(o.id) ?? -10) > 0.6
              ) {
                impacts.current.set(o.id, now);
                audioManager.play('barrel', 0.55);
              }
            }}
          >
            <mesh geometry={geometry} castShadow receiveShadow>
              <meshStandardMaterial
                color={i % 2 ? '#a86d50' : '#ffffff'}
                vertexColors={i % 2 === 0}
                roughness={0.95}
                flatShading
              />
            </mesh>
            {i % 2 ? (
              <ConvexHullCollider
                args={[geometry.getAttribute('position').array as Float32Array]}
                friction={0.3}
              />
            ) : (
              <CuboidCollider
                args={[o.radius, o.radius * 0.6, o.radius]}
                position={[0, o.radius * 0.6, 0]}
                friction={0.3}
              />
            )}
          </RigidBody>
        );
      })}
    </group>
  );
}

/** World art extends the verified graybox; physical surfaces remain source-authoritative. */
export function CanyonWorld({ qualityKey = 'high' }: { qualityKey?: string }) {
  const terrain = useMemo(() => terrainGeometry(), []);
  const box = useMemo(() => new THREE.BoxGeometry(), []);
  const tunnel = useMemo(() => canyonTunnelGeometry(canyon), []);
  const rails = useMemo(
    () =>
      barriers.map((b) => ({
        position: b.p.clone().add(new THREE.Vector3(0, 0.65, 0)),
        rotation: b.yaw,
        scale: new THREE.Vector3(0.36, 1.3, b.length),
      })),
    [],
  );
  useEffect(
    () => () => {
      terrain.dispose();
      box.dispose();
      tunnel.dispose();
    },
    [terrain, box, tunnel],
  );
  return (
    <group name={`canyon-carnival-${qualityKey}`}>
      <PrepareCanyonShaders qualityKey={qualityKey} />
      <GroundColliders road={roadGeometry} terrain={terrain} />
      <TunnelContact geometry={tunnel} />
      <mesh geometry={terrain} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={roadGeometry} receiveShadow name="canyon-authoritative-road">
        <meshStandardMaterial color="#434a4b" roughness={0.95} />
      </mesh>
      <Instances items={rails} geometry={box} color="#e3c99b" shadow={false} />
      <mesh geometry={tunnel} name="canyon-authoritative-rock-tunnels" receiveShadow>
        <meshStandardMaterial color="#ad7354" roughness={1} side={THREE.DoubleSide} flatShading />
      </mesh>
      <SolidObstacles />
      <CanyonScenery qualityKey={qualityKey} />
      <RigidBody type="fixed" colliders={false}>
        {barriers.map((b, i) => (
          <CuboidCollider
            key={i}
            args={[0.18, 0.65, b.length / 2]}
            position={[b.p.x, b.p.y + 0.65, b.p.z]}
            rotation={[0, b.yaw, 0]}
            friction={0.12}
            restitution={0.1}
          />
        ))}
      </RigidBody>
    </group>
  );
}
