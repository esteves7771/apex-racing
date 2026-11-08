// Forward is -Z; negative X-axis wheel rotation cancels translation at the contact patch.
export function wheelAngularSpeed(speed: number, yawRate: number, wheelX: number, radius = 0.38) {
  return -(speed + yawRate * wheelX) / radius;
}
