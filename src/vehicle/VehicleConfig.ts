export interface VehicleConfig {
  maxSpeed: number;
  reverseSpeed: number;
  acceleration: number;
  braking: number;
  grip: number;
  driftGrip: number;
  steering: number;
  drag: number;
  torqueFloor?: number;
  steeringFalloff?: number;
}
export const vehicleConfig: VehicleConfig = {
  maxSpeed: 42,
  reverseSpeed: 9,
  acceleration: 16,
  braking: 25,
  grip: 9,
  driftGrip: 3,
  steering: 1.65,
  drag: 0.24,
};
export function driveStep(
  forward: number,
  lateral: number,
  input: { throttle: boolean; brake: boolean; steer: number; drift: boolean },
  offroad: boolean,
  dt: number,
  config = vehicleConfig,
) {
  let f = forward;
  if (input.throttle)
    f +=
      config.acceleration *
      Math.max(config.torqueFloor ?? 0.16, 1 - Math.max(0, f) / config.maxSpeed) *
      dt;
  else if (input.brake) f -= (f > 0.8 ? config.braking : config.acceleration * 0.55) * dt;
  else f *= Math.exp(-config.drag * dt);
  if (input.brake && forward > 0.8 && f < 0) f = 0;
  if (!input.throttle && !input.brake && Math.abs(f) < 0.08) f = 0;
  f = Math.max(-config.reverseSpeed, Math.min(config.maxSpeed, f));
  if (offroad) f *= Math.exp(-0.9 * dt);
  const drift = input.drift && Math.abs(f) > 7;
  const side = lateral * Math.exp(-(offroad ? 2 : drift ? config.driftGrip : config.grip) * dt);
  const yaw =
    input.steer *
    config.steering *
    Math.min(1, Math.abs(f) / 5) *
    Math.sign(f) *
    (1 - (config.steeringFalloff ?? 0.48) * Math.min(1, Math.abs(f) / config.maxSpeed)) *
    (drift ? 1.25 : 1);
  return { forward: f, lateral: side, yaw, drift };
}
