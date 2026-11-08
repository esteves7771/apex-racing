import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import * as pine from './PineValley';
import * as coast from './CoralCoast';
import { coastPoint, landSection } from './CoastLandscape';
import {
  ArtBuilder,
  forestTree,
  broadTree,
  groundPatch,
  fernAsset,
  rangerCabin,
  lighthouse,
  palmTree,
  forestOverlook,
} from './ArtAssets';
type Item = { position: THREE.Vector3; scale: THREE.Vector3; rotation?: number };
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function pineClusters() {
  const random = seeded(701),
    trees: Item[][] = [[], [], [], []],
    patches: Item[] = [],
    ferns: Item[] = [];
  for (let cluster = 0; cluster < 72; cluster++) {
    const center = cluster / 72,
      side = cluster % 2 ? 1 : -1;
    for (let j = 0; j < 6; j++) {
      const t = (center + (random() - 0.5) * 0.023 + 1) % 1,
        p = pine.poseAt(t).p,
        d = pine.curve.getTangentAt(t),
        w = side * (15 + random() * 32);
      p.x -= d.z * w;
      p.z += d.x * w;
      if (pine.nearestTrack(p.x, p.z).distance < 13) continue;
      p.y = pine.terrainHeight(p.x, p.z);
      const s = 0.65 + random() * 0.8;
      trees[cluster % 4].push({
        position: p,
        scale: new THREE.Vector3(s, s, s),
        rotation: random() * 6.28,
      });
      if (j % 2 === 0)
        patches.push({
          position: p.clone().add(new THREE.Vector3(3, 0, 2)),
          scale: new THREE.Vector3(1.3, 1, 1.3),
          rotation: random() * 6.28,
        });
      if (j % 3 === 0)
        ferns.push({
          position: p.clone().add(new THREE.Vector3(-3, 0, 1)),
          scale: new THREE.Vector3(1, 1, 1),
          rotation: random() * 6.28,
        });
    }
  }
  return { trees, patches, ferns };
}
const forest = pineClusters();
function AssetInstances({
  geometry,
  items,
  shadow = true,
}: {
  geometry: THREE.BufferGeometry;
  items: Item[];
  shadow?: boolean;
}) {
  return (
    <instancedMesh
      args={[geometry, undefined, items.length]}
      castShadow={shadow}
      receiveShadow
      ref={(mesh) => {
        if (!mesh) return;
        const obj = new THREE.Object3D();
        items.forEach((p, i) => {
          obj.position.copy(p.position);
          obj.scale.copy(p.scale);
          obj.rotation.set(0, p.rotation ?? 0, 0);
          obj.updateMatrix();
          mesh.setMatrixAt(i, obj.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }}
    >
      <meshStandardMaterial vertexColors flatShading roughness={0.9} />
    </instancedMesh>
  );
}
export function ForestWorld({ preset }: { preset: string }) {
  const assets = useMemo(
    () => [
      forestTree(0),
      forestTree(1),
      forestTree(2),
      broadTree(),
      groundPatch(),
      fernAsset(),
      rangerCabin(),
      forestOverlook(),
    ],
    [],
  );
  useEffect(() => () => assets.forEach((g) => g.dispose()), [assets]);
  const count = preset === 'low' ? 3 : preset === 'medium' ? 2 : 1;
  const at = pine.poseAt(0.183),
    cabin = at.p
      .clone()
      .addScaledVector(new THREE.Vector3(-Math.cos(at.yaw), 0, Math.sin(at.yaw)), 27);
  cabin.y = pine.terrainHeight(cabin.x, cabin.z);
  const overlook = pine.poseAt(0.215),
    overlookAt = overlook.p
      .clone()
      .addScaledVector(new THREE.Vector3(-Math.cos(overlook.yaw), 0, Math.sin(overlook.yaw)), -24);
  overlookAt.y = pine.terrainHeight(overlookAt.x, overlookAt.z) + 0.25;
  return (
    <group name="pine-forest-world-2">
      <mesh
        name="tier-a-stream-overlook"
        geometry={assets[7]}
        position={overlookAt}
        rotation={[0, overlook.yaw, 0]}
        receiveShadow
      >
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      <group name="tier-b-forest">
        {forest.trees.map((items, i) => (
          <AssetInstances
            key={i}
            geometry={assets[i]}
            items={items.filter((_, k) => k % count === 0)}
          />
        ))}
        <AssetInstances
          geometry={assets[4]}
          items={forest.patches.filter((_, i) => i % count === 0)}
          shadow={false}
        />
        {preset !== 'low' && (
          <AssetInstances geometry={assets[5]} items={forest.ferns} shadow={false} />
        )}
      </group>
      <mesh
        name="tier-a-ranger-station"
        geometry={assets[6]}
        position={cabin}
        rotation={[0, at.yaw + Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial vertexColors flatShading roughness={0.85} />
      </mesh>
    </group>
  );
}
function coastalDetails() {
  const b = new ArtBuilder(),
    random = seeded(772);
  // Tier A: grounded marina facades, doors, striped awnings and balcony rails.
  for (let i = 0; i < 18; i++) {
    const t = 0.002 + i * 0.0031,
      w = (i % 2 ? 1 : -1) * (24 + (i % 3) * 3),
      p = coastPoint(t, w),
      yaw = coast.poseAt(t).yaw,
      h = 8 + (i % 4);
    const add = (local: number[], size: number[], color: string) => {
      const v = new THREE.Vector3(...local).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p);
      b.box(v.toArray(), size, color, [0, yaw, 0]);
    };
    for (const side of [-1, 1]) {
      add([side * 3.58, 1.5, 0], [0.14, 2.9, 1.4], '#375b5c');
      add([side * 4.25, 3.6, 0], [1.8, 0.18, 5.8], i % 2 ? '#cf7f63' : '#d8ad67');
      for (let k = 0; k < 6; k++) add([side * 4.28, 3.68, -2.5 + k], [1.8, 0.04, 0.46], '#f6dfb0');
      add([side * 4.65, h * 0.6, 0], [0.12, 0.2, 6.8], '#f2e2b9');
      for (const z of [-3, -1, 1, 3])
        add([side * 4.65, h * 0.6 - 0.5, z], [0.12, 1.2, 0.12], '#e7d7ae');
    }
  }
  // Tier C: layered islands on the horizon; stay far outside the road envelope.
  for (let i = 0; i < 9; i++) {
    const p = coastPoint(0.87 + i * 0.012, -110 - (i % 3) * 38);
    p.y = -9;
    b.add(
      new THREE.DodecahedronGeometry(1, 1),
      ['#719b91', '#83aa94', '#5d8e89'][i % 3],
      p,
      [28 + random() * 30, 12 + random() * 18, 28 + random() * 20],
      [0, i, 0],
    );
  }
  for (let i = 0; i < 28; i++) {
    const t = 0.135 + i * 0.006,
      p = coastPoint(t, (i % 2 ? 1 : -1) * (24 + (i % 3) * 5));
    if (coast.nearestTrack(p.x, p.z).distance < 18) continue;
    b.add(
      new THREE.DodecahedronGeometry(1, 1),
      ['#b9aa89', '#a5a183', '#c8b795'][i % 3],
      p.clone().add(new THREE.Vector3(0, -2, 0)),
      [4 + (i % 3), 5 + (i % 4), 5],
      [0, i * 0.6, 0],
    );
  }
  return b.finish();
}
const heroPalms: Item[] = [];
for (let i = 0; i < 32; i++) {
  const t = 0.08 + i * 0.0032,
    p = coastPoint(t, (i % 2 ? 1 : -1) * (15 + (i % 4) * 4));
  if (coast.nearestTrack(p.x, p.z).distance > 12)
    heroPalms.push({
      position: p,
      scale: new THREE.Vector3(0.9 + (i % 3) * 0.13, 1 + (i % 3) * 0.13, 0.9 + (i % 3) * 0.13),
      rotation: i,
    });
}
const tropicalPatches: Item[] = [];
for (let i = 0; i < 100; i++) {
  const t = (i / 100) * 0.48;
  if (coast.tunnelAt(t, 0.01)) continue;
  const p = coastPoint(t, (i % 2 ? 1 : -1) * (16 + (i % 5) * 3));
  if (coast.nearestTrack(p.x, p.z).distance > 12)
    tropicalPatches.push({ position: p, scale: new THREE.Vector3(1.5, 1, 1.5), rotation: i });
}
export function TropicalWorld({ preset }: { preset: string }) {
  const assets = useMemo(() => [coastalDetails(), groundPatch(true), lighthouse(), palmTree()], []);
  useEffect(() => () => assets.forEach((g) => g.dispose()), [assets]);
  const island = coastPoint(0.925, -63).setY(-0.5);
  return (
    <group name="coral-tropical-world-2">
      <AssetInstances geometry={assets[3]} items={heroPalms} shadow={preset !== 'low'} />
      <mesh geometry={assets[0]} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </mesh>
      {preset !== 'low' && (
        <AssetInstances geometry={assets[1]} items={tropicalPatches} shadow={false} />
      )}
      <mesh name="tier-a-lighthouse" geometry={assets[2]} position={island} castShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.8} />
      </mesh>
      <mesh position={[island.x, -2, island.z]} scale={[13, 4, 11]} receiveShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#c5b593" flatShading />
      </mesh>
    </group>
  );
}
