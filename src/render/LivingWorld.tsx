import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame, race } from '../game/store';
import { Instances } from '../track/InstancedProps';
import { poseAt, curve, terrainHeight } from '../track/PineValley';
import { WindMaterial } from '../track/WindMaterial';
const birdGeometry = new THREE.ConeGeometry(0.5, 1.6, 3),
  bodyGeometry = new THREE.CapsuleGeometry(0.23, 0.6, 2, 5);
const people = Array.from({ length: 14 }, (_, i) => {
  const p = poseAt(0.012 + i * 0.0015).p,
    d = curve.getTangentAt(0.02);
  p.x -= d.z * 12;
  p.z += d.x * 12;
  p.y = terrainHeight(p.x, p.z) + 0.8;
  return { position: p, scale: new THREE.Vector3(1, 1, 1) };
});
export function LivingWorld() {
  const birds = useRef<THREE.InstancedMesh>(null),
    time = useRef(0),
    object = useRef(new THREE.Object3D());
  const reduced = useGame(
    (s) => s.save.settings.reducedMotion || s.save.settings.effects === 'low',
  );
  useFrame((_, dt) => {
    if (reduced || race.phase === 'PAUSED') return;
    time.current += dt;
    const o = object.current;
    if (birds.current) {
      for (let i = 0; i < 8; i++) {
        const a = time.current * 0.045 + i * 0.14;
        o.position.set(
          110 + Math.sin(a) * 110,
          37 + Math.sin(time.current * 0.5 + i) * 2,
          50 + Math.cos(a) * 75 + i * 2,
        );
        o.rotation.set(Math.PI / 2, 0, -a);
        o.scale.set(1, 0.28 + Math.abs(Math.sin(time.current * 4 + i)) * 0.5, 1);
        o.updateMatrix();
        birds.current.setMatrixAt(i, o.matrix);
      }
      birds.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <Instances items={people} geometry={bodyGeometry} color="#e8a676" wind />
      {!reduced && (
        <instancedMesh ref={birds} args={[birdGeometry, undefined, 8]} frustumCulled={false}>
          <meshBasicMaterial color="#466769" />
        </instancedMesh>
      )}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 10, 0, 112]}>
          <mesh position={[0, 2.1, 0]}>
            <boxGeometry args={[0.12, 4.2, 0.12]} />
            <meshStandardMaterial color="#e9e5cf" />
          </mesh>
          <mesh position={[0.7, 3.4, 0]}>
            <planeGeometry args={[1.4, 1.1, 10, 4]} />
            <WindMaterial color={s > 0 ? '#f08062' : '#60d8d4'} flag />
          </mesh>
        </group>
      ))}
    </>
  );
}
