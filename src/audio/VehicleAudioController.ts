import type { VehicleDefinition } from '../vehicle/VehicleRegistry';
export class VehicleAudioController {
  engine: OscillatorNode;
  tire: OscillatorNode;
  engineGain: GainNode;
  tireGain: GainNode;
  filter: BiquadFilterNode;
  constructor(
    private ctx: AudioContext,
    bus: GainNode,
  ) {
    this.engine = ctx.createOscillator();
    this.tire = ctx.createOscillator();
    this.filter = ctx.createBiquadFilter();
    this.engineGain = ctx.createGain();
    this.tireGain = ctx.createGain();
    this.engine.type = 'sawtooth';
    this.tire.type = 'triangle';
    this.filter.frequency.value = 420;
    this.engine.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(bus);
    this.tire.connect(this.tireGain);
    this.tireGain.connect(bus);
    this.engineGain.gain.value = this.tireGain.gain.value = 0;
    this.engine.start();
    this.tire.start();
  }
  update(
    active: boolean,
    speed: number,
    drift: boolean,
    air: boolean,
    steering: number,
    car: VehicleDefinition,
  ) {
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(
      car.engine.base + Math.abs(speed) * car.engine.multiplier + (air ? 15 : 0),
      t,
      0.08,
    );
    this.engineGain.gain.setTargetAtTime(active ? 0.055 : 0, t, 0.035);
    this.tire.frequency.setTargetAtTime(450 + Math.abs(steering) * 220, t, 0.1);
    this.tireGain.gain.setTargetAtTime(active && drift && !air ? 0.045 : 0, t, 0.035);
  }
  dispose() {
    this.engine.stop();
    this.tire.stop();
    for (const n of [this.engine, this.tire, this.engineGain, this.tireGain, this.filter])
      n.disconnect();
  }
}
