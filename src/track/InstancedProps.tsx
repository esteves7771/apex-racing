import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { WindMaterial } from './WindMaterial';
export function Instances({
  items,
  geometry,
  color,
  shadow = true,
  wind = false,
  doubleSide = false,
  unlit = false,
}: {
  items: { position: THREE.Vector3; scale: THREE.Vector3; rotation?: number }[];
  geometry: THREE.BufferGeometry;
  color: string;
  shadow?: boolean;
  wind?: boolean;
  doubleSide?: boolean;
  unlit?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D();
    items.forEach((item, i) => {
      obj.position.copy(item.position);
      obj.scale.copy(item.scale);
      obj.rotation.set(0, item.rotation ?? 0, 0);
      obj.updateMatrix();
      ref.current!.setMatrixAt(i, obj.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
      castShadow={shadow}
      receiveShadow
    >
      {wind ? (
        <WindMaterial color={color} doubleSide={doubleSide} />
      ) : unlit ? (
        <meshBasicMaterial color={color} />
      ) : (
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      )}
    </instancedMesh>
  );
}
