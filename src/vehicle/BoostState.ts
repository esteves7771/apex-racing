import { boostPads, TRACK_LENGTH } from '../track/CanyonCarnival';
export class BoostState {
  remaining = 0;
  factor = 0;
  serial = 0;
  expiredSerial = 0;
  private touching = new Set<string>();
  reset() {
    this.remaining = 0;
    this.factor = 0;
    this.touching.clear();
  }
  step(t: number, lateral: number, route: string, grounded: boolean, active: boolean, dt = 1 / 60) {
    const was = this.remaining > 0;
    this.remaining = Math.max(0, this.remaining - dt);
    for (const pad of boostPads) {
      const inside =
        active &&
        grounded &&
        pad.route === route &&
        Math.abs(t - pad.t) * TRACK_LENGTH < pad.length / 2 &&
        Math.abs(lateral - pad.lateral) < pad.width / 2;
      if (inside && !this.touching.has(pad.id)) {
        this.remaining = 1.8;
        this.serial++;
        this.touching.add(pad.id);
      } else if (!inside) this.touching.delete(pad.id);
    }
    if (was && this.remaining === 0) this.expiredSerial++;
    this.factor +=
      (Number(this.remaining > 0) - this.factor) *
      (1 - Math.exp(-dt * (this.remaining > 0 ? 7 : 2.5)));
    if (this.factor < 0.001) this.factor = 0;
    return this.factor;
  }
}
