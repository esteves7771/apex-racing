import type RAPIER from '@dimforge/rapier3d-compat';
import { driveStep } from './VehicleConfig';
import type { VehicleDefinition } from './VehicleRegistry';
export interface DriveCommand {
  throttle: boolean;
  brake: boolean;
  steer: number;
  drift: boolean;
}
export function applyVehicleCommand(
  body: RAPIER.RigidBody,
  car: VehicleDefinition,
  input: DriveCommand,
  offroad: boolean,
  grounded: boolean,
  airborne: boolean,
  forward: number,
  lateral: number,
  f: { x: number; z: number },
  right: { x: number; z: number },
  vertical: number,
  dt = 1 / 60,
) {
  const next = driveStep(forward, lateral, input, offroad, dt, car.handling);
  if (grounded) {
    body.setLinvel(
      {
        x: f.x * next.forward + right.x * next.lateral,
        y: vertical,
        z: f.z * next.forward + right.z * next.lateral,
      },
      true,
    );
    body.setAngvel(
      { x: 0, y: body.angvel().y + (next.yaw - body.angvel().y) * car.response, z: 0 },
      true,
    );
  } else if (airborne)
    body.setAngvel({ x: 0, y: body.angvel().y * 0.97 + input.steer * car.airControl, z: 0 }, true);
  return next;
}
