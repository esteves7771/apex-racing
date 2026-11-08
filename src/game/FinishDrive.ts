// Bounded road-following cooldown using the ordinary car controller and braking limits.
import { navAt, angle, clamp } from '../ai/TrackNavigation';
import { nearestTrack, TRACK_LENGTH } from '../track/ActiveTrack';
import type { DriveCommand } from '../vehicle/VehicleDynamics';
export function finishCommand(
  x: number,
  z: number,
  yaw: number,
  speed: number,
  elapsed: number,
): DriveCommand {
  const near = nearestTrack(x, z),
    lookahead = Math.max(8, Math.abs(speed) * 0.65);
  const target = navAt(near.t + lookahead / TRACK_LENGTH, 1.8);
  const error = angle(Math.atan2(-(target.x - x), -(target.z - z)) - yaw);
  const desired = Math.min(
    Math.max(4, 18 - elapsed * 3),
    Math.sqrt(4 / Math.max(0.005, Math.abs(target.curvature))),
  );
  return {
    throttle: speed < desired - 1,
    brake: speed > desired + 1,
    steer: clamp(Math.sin(error) * 3, -1, 1),
    drift: false,
  };
}
