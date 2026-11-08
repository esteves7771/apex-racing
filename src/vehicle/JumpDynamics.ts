import { trackFeatures, trackId } from '../track/ActiveTrack';
export class JumpDynamics {
  armed = true;
  airTime = 0;
  hold = 0;
  airborne = false;
  reset() {
    this.armed = true;
    this.airTime = 0;
    this.hold = 0;
    this.airborne = false;
  }
  step(input: {
    t: number;
    lateral: number;
    speed: number;
    grounded: boolean;
    verticalSpeed: number;
    forward: boolean;
    dt: number;
  }) {
    const j = trackFeatures.jump;
    this.hold = Math.max(0, this.hold - input.dt);
    if (input.t < j.approach - 0.015 || input.t > j.end + 0.02) this.armed = true;
    let launch: number | undefined,
      landing = 0;
    if (
      trackId === 'pine' &&
      this.armed &&
      input.grounded &&
      input.forward &&
      input.speed >= j.takeoffMinSpeed &&
      input.t >= j.crest - 0.001 &&
      input.t <= j.crest + 0.004 &&
      Math.abs(input.lateral - j.laneCenter) < j.laneHalfWidth * 0.48
    ) {
      launch = j.takeoffVelocity + Math.min(25, input.speed - j.takeoffMinSpeed) * 0.02;
      this.armed = false;
      this.hold = 0.16;
    }
    const grounded = input.grounded && this.hold === 0;
    if (!grounded) {
      this.airTime += input.dt;
      this.airborne = true;
    } else {
      if (this.airborne && this.airTime > 0.12)
        landing = Math.max(0.15, Math.min(1, Math.abs(input.verticalSpeed) / 7));
      this.airTime = 0;
      this.airborne = false;
    }
    const takeoff = !grounded && this.airTime >= 0.1 && this.airTime - input.dt < 0.1;
    return { launch, grounded, airborne: this.airborne, landing, takeoff };
  }
}
