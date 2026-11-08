import { useFrame } from '@react-three/fiber';
import { useGame, race } from '../game/store';
import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ArtBuilder } from '../track/ArtAssets';
export function Atmosphere({ track }: { track: string }) {
  const group = useRef<THREE.Mesh>(null),
    time = useRef(0);
  const reduced = useGame((s) => s.save.settings.reducedMotion);
  useFrame((_, dt) => {
    if (!reduced && race.phase !== 'PAUSED') time.current += dt;
    if (group.current) group.current.position.x = Math.sin(time.current * 0.003) * 18;
  });
  const geometry = useMemo(() => {
    const b = new ArtBuilder();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4,
        x = (track === 'coast' ? 250 : 120) + Math.sin(a) * 620,
        z = (track === 'coast' ? -100 : 70) + Math.cos(a) * 600;
      for (let j = 0; j < 4; j++)
        b.add(
          new THREE.IcosahedronGeometry(1, 1),
          track === 'pine' ? (j % 2 ? '#d4e1df' : '#e8ece3') : j % 2 ? '#e3ebd8' : '#f4eed9',
          [x + j * 20, 105 + (i % 3) * 19 + (j % 2) * 5, z],
          [30, 9 + (j % 2) * 5, 19],
          [0, a, 0],
        );
    }
    return b.finish();
  }, [track]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh ref={group} geometry={geometry} name="tier-c-sky-silhouettes">
      <meshBasicMaterial vertexColors fog />
    </mesh>
  );
}
