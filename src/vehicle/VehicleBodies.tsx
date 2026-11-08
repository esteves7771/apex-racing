import { extend, type ThreeElement } from '@react-three/fiber';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { VehicleId } from './VehicleRegistry';
// Flat-shaded wedge with a rising shoulder line; front is always -Z.
export class WedgeGeometry extends THREE.ExtrudeGeometry {
  constructor() {
    const shape = new THREE.Shape();
    shape.moveTo(-1.75, 0);
    shape.lineTo(1.75, 0);
    shape.lineTo(1.6, 0.53);
    shape.lineTo(-1.6, 0.26);
    shape.closePath();
    super(shape, {
      depth: 1.78,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06,
    });
    this.rotateY(-Math.PI / 2);
    this.translate(0.89, 0.23, 0);
    this.computeVertexNormals();
  }
}
export function makeWedge() {
  return new WedgeGeometry();
}
extend({ WedgeGeometry });
declare module '@react-three/fiber' {
  interface ThreeElements {
    wedgeGeometry: ThreeElement<typeof WedgeGeometry>;
  }
}
export function VehicleBody({
  id,
  color,
  brakes,
}: {
  id: VehicleId;
  color: string;
  brakes: MutableRefObject<THREE.MeshStandardMaterial[]>;
}) {
  const bolt = id === 'bolt';
  return (
    <>
      {bolt ? (
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.74, 0.65, 3.12]} />
          <meshStandardMaterial color={color} roughness={0.42} />
        </mesh>
      ) : (
        <mesh castShadow>
          <wedgeGeometry />
          <meshStandardMaterial color={color} roughness={0.32} />
        </mesh>
      )}
      <mesh
        position={[0, bolt ? 1.1 : 0.87, bolt ? 0.18 : 0.25]}
        rotation={[bolt ? -0.08 : -0.16, 0, 0]}
        castShadow
      >
        <boxGeometry args={[bolt ? 1.43 : 1.35, bolt ? 0.9 : 0.48, bolt ? 1.65 : 1.48]} />
        <meshStandardMaterial color="#264957" metalness={0.2} roughness={0.25} />
      </mesh>
      <mesh position={[0, bolt ? 1.58 : 1.14, 0.35]} castShadow>
        <boxGeometry args={[bolt ? 1.5 : 1.3, 0.11, bolt ? 1.48 : 1.15]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {bolt && (
        <>
          <mesh position={[0, 1.72, 0.28]}>
            <boxGeometry args={[1.2, 0.16, 0.65]} />
            <meshStandardMaterial color="#32484c" />
          </mesh>
          <mesh position={[0, 0.72, -1.61]}>
            <boxGeometry args={[1.25, 0.22, 0.08]} />
            <meshStandardMaterial color="#2a3b42" />
          </mesh>
        </>
      )}
      <mesh position={[0, 0.28, bolt ? -1.65 : -1.85]}>
        <boxGeometry args={[1.86, 0.15, 0.24]} />
        <meshStandardMaterial color="#263c43" />
      </mesh>
      {[-1, 1].map((s, i) => (
        <group key={s}>
          <mesh position={[s * 0.62, bolt ? 0.85 : 0.59, bolt ? -1.59 : -1.76]}>
            <boxGeometry args={[bolt ? 0.4 : 0.49, bolt ? 0.23 : 0.075, 0.06]} />
            <meshStandardMaterial color="#fff3d4" emissive="#fff0c5" emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[s * 0.62, bolt ? 0.77 : 0.74, bolt ? 1.59 : 1.77]}>
            <boxGeometry args={[bolt ? 0.18 : 0.58, bolt ? 0.34 : 0.09, 0.06]} />
            <meshStandardMaterial
              ref={(m) => {
                if (m) brakes.current[i] = m;
              }}
              color="#e04b4b"
              emissive="#ff3322"
              emissiveIntensity={0.6}
            />
          </mesh>
          <mesh position={[s * 0.62, bolt ? 1.27 : 1.13, bolt ? 1.22 : 1.45]}>
            <boxGeometry args={[0.1, 0.36, 0.15]} />
            <meshStandardMaterial color="#2c4149" />
          </mesh>
          <mesh position={[s * 0.93, bolt ? 1.03 : 0.89, -0.45]}>
            <boxGeometry args={[0.2, 0.14, 0.3]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {[-1.16, 1.16].map((z) => (
            <mesh key={z} position={[s * 0.9, 0.29, z]}>
              <boxGeometry args={[0.23, bolt ? 0.52 : 0.3, 0.9]} />
              <meshStandardMaterial color="#2c424b" />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, bolt ? 1.5 : 1.37, bolt ? 1.3 : 1.49]} castShadow>
        <boxGeometry args={[bolt ? 1.82 : 2.05, 0.12, bolt ? 0.35 : 0.5]} />
        <meshStandardMaterial color={bolt ? color : '#243945'} />
      </mesh>
      <mesh position={[0, 0.3, bolt ? 1.66 : 1.84]}>
        <boxGeometry args={[1.8, 0.22, 0.12]} />
        <meshStandardMaterial color="#263c43" />
      </mesh>
    </>
  );
}
