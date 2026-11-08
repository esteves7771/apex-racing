import { race, telemetry } from '../game/store';
import { getVehicle } from '../vehicle/VehicleRegistry';
export class RivalAudioController {
  voices: {
    osc: OscillatorNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    pan: StereoPannerNode;
  }[] = [];
  constructor(
    private ctx: AudioContext,
    bus: GainNode,
  ) {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain(),
        pan = ctx.createStereoPanner();
      osc.type = 'sawtooth';
      filter.frequency.value = 350;
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(bus);
      osc.start();
      this.voices.push({ osc, filter, gain, pan });
    }
  }
  update() {
    const active = race.mode === 'gp' && ['RACING', 'FINISHING'].includes(race.phase),
      now = this.ctx.currentTime;
    this.voices.forEach((voice, i) => {
      const r = race.gp.racers[i + 1];
      if (!r) {
        voice.gain.gain.setTargetAtTime(0, now, 0.1);
        return;
      }
      const dx = r.x - telemetry.x,
        dz = r.z - telemetry.z,
        distance = Math.hypot(dx, dz),
        profile = getVehicle(r.vehicle).engine;
      voice.osc.frequency.setTargetAtTime(
        profile.base + Math.abs(r.speed) * profile.multiplier,
        now,
        0.1,
      );
      voice.gain.gain.setTargetAtTime(
        active && distance < 65 ? 0.055 / (1 + (distance / 12) ** 2) : 0,
        now,
        0.08,
      );
      voice.pan.pan.setTargetAtTime(
        Math.max(
          -1,
          Math.min(1, (dx * Math.cos(telemetry.yaw) - dz * Math.sin(telemetry.yaw)) / 15),
        ),
        now,
        0.1,
      );
    });
  }
  dispose() {
    for (const v of this.voices) {
      v.osc.stop();
      v.osc.disconnect();
      v.filter.disconnect();
      v.gain.disconnect();
      v.pan.disconnect();
    }
    this.voices = [];
  }
}
