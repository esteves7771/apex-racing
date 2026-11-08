import { useLayoutEffect } from 'react';
import { useRapier } from '@react-three/rapier';
import RAPIER from '@dimforge/rapier3d-compat';
import type { BufferGeometry } from 'three';

export const GROUND_TRIMESH_FLAGS = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES;
export function createGroundCollider(
  world: RAPIER.World,
  geometry: BufferGeometry,
  flags: number = GROUND_TRIMESH_FLAGS,
) {
  return world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      geometry.getAttribute('position').array as Float32Array,
      new Uint32Array(geometry.index!.array),
      flags,
    ).setFriction(0),
  );
}

// R3F Rapier 2.2's TrimeshCollider args omit Rapier's third (flags) argument.
// Use the public Rapier API and clean up explicitly; geometry stays identical to rendering.
export function GroundColliders({
  road,
  terrain,
}: {
  road: BufferGeometry;
  terrain: BufferGeometry;
}) {
  const { world } = useRapier();
  useLayoutEffect(() => {
    const colliders = [createGroundCollider(world, terrain), createGroundCollider(world, road)];
    return () => {
      for (const collider of colliders)
        if (collider.isValid()) world.removeCollider(collider, true);
    };
  }, [world, road, terrain]);
  return null;
}
