import { poseAt, surfaceAt } from '../track/ActiveTrack';

export const chassisPhysics = {
  halfExtents: [0.84, 0.34, 1.7] as [number, number, number],
  mass: 850,
  contactSkin: 0.04,
  spawnClearance: 0.06,
};
export function vehicleSpawn(t: number, lateral = 0) {
  const pose = poseAt(t),
    [width, height, length] = chassisPhysics.halfExtents;
  pose.p.x += Math.cos(pose.yaw) * lateral;
  pose.p.z -= Math.sin(pose.yaw) * lateral;
  let surface = -Infinity;
  // An upright chassis must clear the highest ground beneath its entire rotated footprint.
  for (const x of [-width, 0, width])
    for (const z of [-length, 0, length]) {
      const wx = pose.p.x + Math.cos(pose.yaw) * x + Math.sin(pose.yaw) * z;
      const wz = pose.p.z - Math.sin(pose.yaw) * x + Math.cos(pose.yaw) * z;
      surface = Math.max(surface, surfaceAt(wx, wz).height);
    }
  pose.p.y = surface + height + chassisPhysics.spawnClearance;
  return pose;
}
