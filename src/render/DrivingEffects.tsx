import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { telemetry, race, useGame } from '../game/store';
import { carPosition, carForward } from '../vehicle/ArcadeVehicleController';
const COUNT = 96;
export function DrivingEffects({ density = 'full' }: { density?: 'full' | 'low' }) {
  const mesh = useRef<THREE.InstancedMesh>(null),
    pool = useRef(
      Array.from({ length: COUNT }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        life: 0,
        size: 0.3,
      })),
    ),
    object = useRef(new THREE.Object3D()),
    index = useRef(0),
    timer = useRef(0),
    serial = useRef(0),
    seed = useRef(5);
  const random = () => {
    seed.current = (seed.current * 1664525 + 1013904223) >>> 0;
    return seed.current / 4294967296;
  };
  const emit = (n: number, landing = false) => {
    if (density === 'low' || useGame.getState().save.settings.effects === 'low')
      n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const s = pool.current[index.current++ % COUNT];
      s.p.copy(carPosition).addScaledVector(carForward, -1.2);
      s.p.x += (random() - 0.5) * 1.9;
      s.p.y -= 0.25;
      s.p.z += (random() - 0.5) * 1.2;
      s.v.set(
        (random() - 0.5) * (landing ? 4 : 1.5),
        0.6 + random(),
        (random() - 0.5) * (landing ? 4 : 1.5),
      );
      s.life = 0.5 + random() * 0.3;
      s.size = landing ? 0.35 : 0.22;
    }
  };
  useEffect(() => {
    if (mesh.current) {
      object.current.scale.setScalar(0);
      object.current.updateMatrix();
      for (let i = 0; i < COUNT; i++) mesh.current.setMatrixAt(i, object.current.matrix);
      mesh.current.instanceMatrix.needsUpdate = true;
    }
  }, []);
  useFrame((_, dt) => {
    if (!mesh.current) return;
    if (race.phase === 'PAUSED') return;
    timer.current += dt;
    if (
      race.phase === 'RACING' &&
      telemetry.boostRemaining > 0 &&
      timer.current > 0.04 &&
      !useGame.getState().save.settings.reducedMotion
    ) {
      emit(2);
      timer.current = 0;
    }
    (mesh.current.material as THREE.MeshBasicMaterial).color.set(
      telemetry.boostRemaining > 0 ? '#65ebf1' : '#e3ddc0',
    );
    if (race.phase === 'RACING' && telemetry.drift && telemetry.grounded && timer.current > 0.05) {
      emit(2);
      timer.current = 0;
    }
    if (serial.current !== telemetry.landingSerial) {
      serial.current = telemetry.landingSerial;
      emit(12, true);
    }
    pool.current.forEach((s, i) => {
      s.life = Math.max(0, s.life - dt);
      if (s.life > 0) {
        s.p.addScaledVector(s.v, dt);
        object.current.position.copy(s.p);
        object.current.scale.setScalar(
          s.size * Math.sin((Math.min(1, s.life / 0.6) * Math.PI) / 2),
        );
      } else object.current.scale.setScalar(0);
      object.current.updateMatrix();
      mesh.current!.setMatrixAt(i, object.current.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#e3ddc0" transparent opacity={0.24} depthWrite={false} />
    </instancedMesh>
  );
}
