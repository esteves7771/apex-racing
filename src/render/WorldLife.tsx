import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ArtBuilder } from '../track/ArtAssets';
import { tracks } from '../track/ActiveTrack';
import { coastPoint } from '../track/CoastLandscape';
import { race, useGame } from '../game/store';

export function personGeometry(variant: number) {
  const b = new ArtBuilder(),
    shirt = ['#d98662', '#588f9b', '#e9c65d'][variant];
  b.box([0, 1.1, 0], [0.48, 0.62, 0.3], shirt);
  b.box([0, 1.48, 0], [0.13, 0.14, 0.13], '#d7b38d');
  b.add(new THREE.IcosahedronGeometry(0.21, 1), '#d7b38d', [0, 1.72, 0]);
  b.box([0, 1.9, 0], [0.4, 0.11, 0.36], variant === 2 ? '#f4e8bd' : '#3b5050');
  if (variant === 2) b.box([0, 1.18, -0.16], [0.12, 0.48, 0.02], '#f6f1bf');
  for (const side of [-1, 1]) {
    b.box([side * 0.14, 0.52, 0], [0.18, 0.64, 0.2], '#3f555c');
    b.box([side * 0.14, 0.17, -0.07], [0.22, 0.16, 0.34], '#293c41');
    b.box([side * 0.37, variant === 1 ? 1.5 : 1.02, 0], [0.16, 0.57, 0.17], shirt, [
      0,
      0,
      variant === 1 ? side * 0.65 : side * 0.16,
    ]);
    b.box(
      [side * (variant === 1 ? 0.53 : 0.41), variant === 1 ? 1.75 : 0.73, 0],
      [0.15, 0.16, 0.15],
      '#d7b38d',
    );
  }
  return b.finish();
}
function birdGeometry() {
  const b = new ArtBuilder();
  b.add(new THREE.IcosahedronGeometry(), '#e4e4cf', [0, 0, 0], [0.18, 0.17, 0.5]);
  b.add(
    new THREE.ConeGeometry(0.12, 0.28, 4),
    '#d6ae65',
    [0, 0, -0.58],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  return b.finish();
}
export function spectatorPockets(track: 'pine' | 'coast') {
  return Array.from({ length: 36 }, (_, i) => {
    const t =
      track === 'pine'
        ? [0.008, 0.215, 0.74][i % 3] + Math.floor(i / 3) * 0.0008
        : [0.012, 0.04, 0.115][i % 3] + Math.floor(i / 3) * 0.0007;
    const road = tracks[track],
      p = track === 'coast' ? coastPoint(t, i % 2 ? 15 : -15) : road.poseAt(t).p;
    if (track === 'pine') {
      const d = road.curve.getTangentAt(t);
      p.add(new THREE.Vector3(-d.z * (i % 2 ? 15 : -15), 0, d.x * (i % 2 ? 15 : -15)));
      p.y = road.terrainHeight(p.x, p.z);
    }
    return { p, yaw: road.poseAt(t).yaw, variant: Math.floor(i / 3) % 3 };
  });
}
export function WorldLife({ track }: { track: 'pine' | 'coast' }) {
  const people = useRef<(THREE.InstancedMesh | null)[]>([]),
    birds = useRef<THREE.InstancedMesh>(null),
    wings = useRef<THREE.InstancedMesh>(null),
    elapsed = useRef(0);
  const reduced = useGame(
    (s) => s.save.settings.reducedMotion || s.save.settings.effects === 'low',
  );
  const assets = useMemo(
    () => [
      personGeometry(0),
      personGeometry(1),
      personGeometry(2),
      birdGeometry(),
      new THREE.ConeGeometry(0.28, 1.15, 3),
    ],
    [],
  );
  useEffect(() => () => assets.forEach((g) => g.dispose()), [assets]);
  const pockets = useMemo(() => spectatorPockets(track), [track]);
  const object = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (race.phase !== 'PAUSED' && !reduced) elapsed.current += dt;
    const time = elapsed.current;
    for (let v = 0; v < 3; v++) {
      let index = 0;
      for (const [i, p] of pockets.entries()) {
        if (p.variant !== v) continue;
        object.position.copy(p.p);
        object.position.y += reduced ? 0 : Math.sin(time * 1.4 + i) * 0.035;
        object.rotation.set(0, p.yaw, Math.sin(time * 0.8 + i) * (reduced ? 0 : 0.035));
        object.scale.setScalar(1);
        object.updateMatrix();
        people.current[v]?.setMatrixAt(index++, object.matrix);
      }
      if (people.current[v]) people.current[v]!.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < 6; i++) {
      const a = time * 0.035 + i * 1.05,
        yaw = a - Math.PI / 2;
      object.position.set(
        (track === 'pine' ? 130 : 30) + Math.sin(a) * 75,
        30 + (i % 3) * 5,
        (track === 'pine' ? 70 : 210) + Math.cos(a) * 65,
      );
      object.rotation.set(0, yaw, 0);
      object.scale.setScalar(1);
      object.updateMatrix();
      birds.current?.setMatrixAt(i, object.matrix);
      for (const side of [-1, 1]) {
        object.position.x += Math.cos(yaw) * side * 0.42;
        object.position.z += -Math.sin(yaw) * side * 0.42;
        object.rotation.set(0, yaw, side * (0.9 + (reduced ? 0 : Math.sin(time * 4 + i) * 0.28)));
        object.scale.set(1, 1, 0.35);
        object.updateMatrix();
        wings.current?.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), object.matrix);
        object.position.x -= Math.cos(yaw) * side * 0.42;
        object.position.z -= -Math.sin(yaw) * side * 0.42;
      }
    }
    if (birds.current) birds.current.instanceMatrix.needsUpdate = true;
    if (wings.current) wings.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="decorative-world-life">
      {[0, 1, 2].map((v) => (
        <instancedMesh
          key={v}
          ref={(m) => {
            people.current[v] = m;
          }}
          args={[assets[v], undefined, 12]}
          frustumCulled={false}
        >
          <meshStandardMaterial vertexColors flatShading roughness={0.9} />
        </instancedMesh>
      ))}
      <instancedMesh ref={birds} args={[assets[3], undefined, 6]} frustumCulled={false}>
        <meshStandardMaterial vertexColors flatShading />
      </instancedMesh>
      <instancedMesh ref={wings} args={[assets[4], undefined, 12]} frustumCulled={false}>
        <meshStandardMaterial color={track === 'coast' ? '#eee9d4' : '#667e76'} flatShading />
      </instancedMesh>
    </group>
  );
}
