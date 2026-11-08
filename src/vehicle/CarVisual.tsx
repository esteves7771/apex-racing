import { VehicleTrim } from './VehicleTrim';
import { useRef } from 'react';
import { useFrame, extend, type ThreeElement } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { telemetry, useGame } from '../game/store';
import { wheelAngularSpeed } from './wheelAnimation';
import { VehicleBody } from './VehicleBodies';
import { getVehicle, type VehicleId } from './VehicleRegistry';
extend({ RoundedBoxGeometry });
declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElement<typeof RoundedBoxGeometry>;
  }
}
export function CarVisual({
  preview = false,
  id,
  state = telemetry,
  paint,
}: {
  preview?: boolean;
  id?: VehicleId;
  state?: typeof telemetry;
  paint?: string;
}) {
  const settings = useGame((s) => s.save.settings),
    selected = id ?? settings.vehicle;
  const animation = selected === 'bolt' ? 1.22 : selected === 'vortex' ? 0.7 : 1;
  const color =
      paint ??
      settings.colors[selected] ??
      (selected === 'sprinter' ? settings.color : getVehicle(selected).color),
    body = useRef<THREE.Group>(null),
    wheels = useRef<THREE.Group>(null),
    brakes = useRef<THREE.MeshStandardMaterial[]>([]),
    shadow = useRef<THREE.Mesh>(null);
  const spin = useRef([0, 0, 0, 0]),
    landing = useRef({ serial: 0, time: 10, strength: 0 });
  useFrame((_, dt) => {
    if (preview) return;
    spin.current.forEach(
      (_, i) =>
        (spin.current[i] +=
          wheelAngularSpeed(state.speed, state.yawRate, i % 2 ? 0.94 : -0.94) * dt),
    );
    if (landing.current.serial !== state.landingSerial) {
      landing.current = {
        serial: state.landingSerial,
        time: 0,
        strength: state.landingStrength,
      };
    }
    landing.current.time += dt;
    const squash =
      -0.12 *
      landing.current.strength *
      animation *
      Math.sin(landing.current.time * 17) *
      Math.exp(-landing.current.time * 8);
    if (body.current) {
      body.current.rotation.z = THREE.MathUtils.damp(
        body.current.rotation.z,
        -state.steering * Math.min(Math.abs(state.speed) / 30, 1) * 0.08 * animation +
          state.bankAngle,
        8,
        dt,
      );
      body.current.rotation.x = THREE.MathUtils.damp(
        body.current.rotation.x,
        (state.airborne
          ? Math.atan2(state.verticalSpeed, Math.max(8, Math.abs(state.speed))) * 0.5
          : state.groundPitch) +
          THREE.MathUtils.clamp(state.acceleration * 0.003 * animation, -0.08, 0.05),
        6,
        dt,
      );
      body.current.position.y = squash;
    }
    wheels.current?.children.forEach((wheel, i) => {
      wheel.rotation.y = THREE.MathUtils.damp(
        wheel.rotation.y,
        i < 2 ? state.steering * 0.38 : 0,
        12,
        dt,
      );
      (wheel.children[0] as THREE.Group).rotation.x = spin.current[i];
    });
    for (const brake of brakes.current)
      if (brake)
        brake.emissiveIntensity = THREE.MathUtils.damp(
          brake.emissiveIntensity,
          state.braking || state.drift ? 3 : 0.5,
          18,
          dt,
        );
    if (shadow.current) shadow.current.visible = !state.airborne;
  });
  return (
    <group name="bodyRoot">
      <group ref={body} name="visualBody">
        <VehicleTrim id={selected}/>
        {selected !== 'sprinter' ? (
          <VehicleBody key={selected} id={selected} color={color} brakes={brakes} />
        ) : (
          <>
            <mesh position={[0, 0.46, 0]} castShadow>
              <roundedBoxGeometry args={[1.78, 0.58, 3.65, 3, 0.16]} />
              <meshStandardMaterial color={color} roughness={0.38} />
            </mesh>
            <mesh name="windshield" position={[0, 1.01, 0.22]} castShadow>
              <roundedBoxGeometry args={[1.48, 0.67, 1.65, 3, 0.16]} />
              <meshStandardMaterial color="#254a56" metalness={0.2} roughness={0.28} />
            </mesh>
            <mesh position={[0, 1.36, 0.32]} castShadow>
              <boxGeometry args={[1.36, 0.1, 1.3]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, 0.78, -1.12]} rotation={[-0.07, 0, 0]}>
              <boxGeometry args={[1.4, 0.08, 1.05]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, 0.38, -1.84]}>
              <boxGeometry args={[0.88, 0.16, 0.065]} />
              <meshStandardMaterial color="#253d42" />
            </mesh>
            <mesh position={[0, 0.2, -1.9]}>
              <boxGeometry args={[1.8, 0.09, 0.2]} />
              <meshStandardMaterial color="#5a7170" />
            </mesh>
            <mesh position={[0, 1.09, -0.63]} rotation={[-0.18, 0, 0]}>
              <boxGeometry args={[1.23, 0.43, 0.035]} />
              <meshStandardMaterial color="#69a4ad" metalness={0.2} roughness={0.2} />
            </mesh>
            {[-1, 1].map((s) => (
              <group key={'detail' + s}>
                <mesh position={[s * 0.77, 1.05, 0.42]}>
                  <boxGeometry args={[0.08, 0.6, 0.1]} />
                  <meshStandardMaterial color={color} />
                </mesh>
                {[-1.16, 1.16].map((z) => (
                  <mesh key={z} position={[s * 0.93, 0.04, z]} rotation={[0, Math.PI / 2, 0]}>
                    <torusGeometry args={[0.43, 0.055, 5, 14, Math.PI]} />
                    <meshStandardMaterial color="#31454a" roughness={0.8} />
                  </mesh>
                ))}
                <mesh position={[s * 0.54, 0.57, -1.88]}>
                  <boxGeometry args={[0.34, 0.12, 0.015]} />
                  <meshStandardMaterial
                    color="#fff6d7"
                    emissive="#fff0c5"
                    emissiveIntensity={0.8}
                  />
                </mesh>
              </group>
            ))}
            {[-1, 1].map((s) => (
              <group key={s}>
                <mesh position={[s * 0.54, 0.57, -1.84]}>
                  <boxGeometry args={[0.42, 0.21, 0.06]} />
                  <meshStandardMaterial
                    color="#fff3ce"
                    emissive="#ffe9ae"
                    emissiveIntensity={0.6}
                  />
                </mesh>
                <mesh position={[s * 0.59, 0.56, 1.84]}>
                  <boxGeometry args={[0.35, 0.16, 0.06]} />
                  <meshStandardMaterial
                    ref={(m) => {
                      if (m) brakes.current[s === 1 ? 1 : 0] = m;
                    }}
                    color="#d4413e"
                    emissive="#ff3322"
                    emissiveIntensity={0.7}
                  />
                </mesh>
                <mesh position={[s * 0.63, 0.93, 1.4]}>
                  <boxGeometry args={[0.09, 0.38, 0.13]} />
                  <meshStandardMaterial color="#263e40" />
                </mesh>
                <mesh position={[s * 0.97, 0.97, -0.45]}>
                  <boxGeometry args={[0.24, 0.18, 0.32]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 1.1, 1.44]} castShadow>
              <boxGeometry args={[1.96, 0.12, 0.43]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[0, 0.23, s * 1.8]}>
                <roundedBoxGeometry args={[1.85, 0.22, 0.25, 2, 0.08]} />
                <meshStandardMaterial color="#253d42" />
              </mesh>
            ))}
            <mesh position={[0, 0.48, 1.89]}>
              <boxGeometry args={[0.47, 0.14, 0.02]} />
              <meshStandardMaterial color="#e7eef0" />
            </mesh>
          </>
        )}
      </group>
      <group ref={wheels} scale={selected === 'bolt' ? [1, 1.06, 1] : [1, 1, 1]}>
        {[
          [-0.94, -1.16],
          [0.94, -1.16],
          [-0.94, 1.16],
          [0.94, 1.16],
        ].map(([x, z], i) => (
          <group
            key={i}
            name={['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'][i]}
            position={[x, 0.04, z]}
          >
            <group>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.38, 0.38, 0.33, 16]} />
                <meshStandardMaterial color="#202f36" roughness={0.9} />
              </mesh>
              <mesh position={[Math.sign(x) * 0.176, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.24, 0.24, 0.035, 12]} />
                <meshStandardMaterial color="#f8e9ba" metalness={0.4} />
              </mesh>
              <mesh position={[Math.sign(x) * 0.195, 0, 0]}>
                <boxGeometry args={[0.025, 0.32, 0.065]} />
                <meshStandardMaterial color="#567175" />
              </mesh>
              <mesh position={[Math.sign(x) * 0.2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <boxGeometry args={[0.026, 0.32, 0.06]} />
                <meshStandardMaterial color="#567175" />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      <mesh ref={shadow} name="shadow" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.325, 0]}>
        <planeGeometry args={[2.3, 4.05]} />
        <meshBasicMaterial color="#153d38" opacity={0.17} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
