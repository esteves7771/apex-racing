import RAPIER from '@dimforge/rapier3d-compat';
import { chassisPhysics } from './physicsGeometry';
const probes = [
  [0, 0],
  [1.25, 0],
  [-1.25, 0],
  [0, 0.7],
  [0, -0.7],
] as const;
const canyonProbes = [
  [0, 0],
  [1.55, 0],
  [-1.55, 0],
  [0, 0.78],
  [0, -0.78],
  [1.55, 0.78],
  [1.55, -0.78],
  [-1.55, 0.78],
  [-1.55, -0.78],
] as const;
export function probeGround(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  forward: { x: number; z: number },
  right: { x: number; z: number },
  profile: 'default' | 'canyon' = 'default',
) {
  const p = body.translation();
  let distance = Infinity,
    normal = { x: 0, y: 1, z: 0 };
  for (const [long, side] of profile === 'canyon' ? canyonProbes : probes) {
    const hit = world.castRayAndGetNormal(
      new RAPIER.Ray(
        {
          x: p.x + forward.x * long + right.x * side,
          y: p.y,
          z: p.z + forward.z * long + right.z * side,
        },
        { x: 0, y: -1, z: 0 },
      ),
      0.75,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );
    if (hit && hit.normal.y > 0.55 && hit.timeOfImpact < distance) {
      distance = hit.timeOfImpact;
      normal = { ...hit.normal };
    }
  }
  return {
    grounded: distance < chassisPhysics.halfExtents[1] + chassisPhysics.contactSkin + 0.09,
    distance,
    normal,
  };
}
