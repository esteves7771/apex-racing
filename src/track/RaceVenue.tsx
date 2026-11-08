import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { activeTrack } from './ActiveTrack';
import { gridSpawn } from '../game/GrandPrix';
import { race } from '../game/store';
import { finishPaint, gridPaint, raceLightSignal } from './RaceVenueGeometry';
import { TrackLabel } from './EvolutionScenery';
export function RaceMarkings() {
  const geometries = useMemo(
    () => [
      finishPaint(activeTrack),
      gridPaint(
        activeTrack,
        Array.from({ length: 4 }, (_, i) => gridSpawn(i)),
      ),
    ],
    [],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <group name="coral-race-markings">
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} renderOrder={2}>
          <meshStandardMaterial
            vertexColors
            roughness={1}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
    </group>
  );
}
export function StartingLights() {
  const group = useRef<THREE.Group>(null),
    materials = useMemo(
      () => Array.from({ length: 3 }, () => new THREE.MeshBasicMaterial({ color: '#233a35' })),
      [],
    ),
    last = useRef('');
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useFrame(() => {
    const signal = raceLightSignal(
      race.phase,
      race.countdown,
      race.elapsed,
      race.mode,
      race.previousPhase,
    );
    if (signal === last.current) return;
    last.current = signal;
    if (group.current) group.current.userData.signal = signal;
    materials.forEach((m, i) =>
      m.color.set(
        signal === 'go'
          ? '#7cffa8'
          : signal === 'finish'
            ? '#ffe6a4'
            : signal.startsWith('red-') && i < Number(signal.at(-1))
              ? '#ff6559'
              : '#233a35',
      ),
    );
  });
  return (
    <group ref={group} name="coral-start-lights" position={[0, 10.6, 1.1]}>
      <mesh>
        <boxGeometry args={[5.4, 1.25, 0.5]} />
        <meshStandardMaterial color="#173f3d" />
      </mesh>
      {materials.map((m, i) => (
        <mesh
          key={i}
          material={m}
          position={[(i - 1) * 1.6, 0, 0.29]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.4, 0.4, 0.1, 12]} />
        </mesh>
      ))}
    </group>
  );
}
export const coralVenuePalette = { structure: '#e58d6c', trim: '#f6e2ae', branding: '#146b66' };
export function RaceVenue({ palette = coralVenuePalette }: { palette?: typeof coralVenuePalette }) {
  const start = activeTrack.poseAt(0);
  return (
    <>
      <RaceMarkings />
      <group position={start.p} rotation={[0, start.yaw, 0]} name="coral-start-venue">
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 8.7, 0, 0]}>
            <mesh position={[0, 6, 0]} castShadow>
              <boxGeometry args={[1.2, 12, 1.7]} />
              <meshStandardMaterial color={palette.structure} />
            </mesh>
            <mesh position={[0, 1.05, 0]}>
              <boxGeometry args={[1.6, 3.1, 2]} />
              <meshStandardMaterial color={palette.trim} />
            </mesh>
            <mesh position={[0, 10.8, 0]}>
              <boxGeometry args={[1.6, 0.35, 2]} />
              <meshStandardMaterial color={palette.trim} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 12.35, 0]} castShadow>
          <boxGeometry args={[19, 1.8, 1.5]} />
          <meshStandardMaterial color={palette.structure} />
        </mesh>
        <mesh position={[0, 13.35, 0]}>
          <boxGeometry args={[20, 0.3, 2]} />
          <meshStandardMaterial color={palette.trim} />
        </mesh>
        <mesh position={[0, 12.35, 0.78]}>
          <boxGeometry args={[13, 1.28, 0.08]} />
          <meshStandardMaterial color={palette.branding} />
        </mesh>
        <TrackLabel
          text="APEX  /  CORAL COAST RUSH"
          position={[0, 12.35, 0.85]}
          width={12.4}
          height={1.04}
        />
        <StartingLights />
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 19, 0, 16]}>
            <mesh position={[0, -0.45, 0]}>
              <boxGeometry args={[8, 4, 9]} />
              <meshStandardMaterial color="#e9c69a" />
            </mesh>
            <mesh position={[0, 4.8, 0]} castShadow>
              <coneGeometry args={[6.5, 1.5, 4]} />
              <meshStandardMaterial color={side > 0 ? '#e68e72' : '#61aaa4'} />
            </mesh>
            {[-3, 3].flatMap((x) =>
              [-3, 3].map((z) => (
                <mesh key={`${x},${z}`} position={[x, 2.7, z]}>
                  <boxGeometry args={[0.18, 4.6, 0.18]} />
                  <meshStandardMaterial color={palette.trim} />
                </mesh>
              )),
            )}
            <TrackLabel
              text={side > 0 ? 'CORAL COAST / RACE CLUB' : 'SUNSET MARINA / APEX'}
              position={[0, 3.6, 3.6]}
              width={7.4}
              height={0.7}
            />
          </group>
        ))}
      </group>
    </>
  );
}
