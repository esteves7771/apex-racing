export type Sound =
  | 'cone'
  | 'barrel'
  | 'crate'
  | 'countdown'
  | 'start'
  | 'finish'
  | 'best'
  | 'menu'
  | 'garage'
  | 'jump'
  | 'landing'
  | 'positionUp'
  | 'positionDown'
  | 'pass'
  | 'carImpact'
  | 'podium'
  | 'boost'
  | 'boostEnd';
export class SoundEffectManager {
  voices = new Set<OscillatorNode>();
  last = new Map<string, number>();
  constructor(
    private ctx: AudioContext,
    private bus: GainNode,
  ) {}
  play(sound: Sound, strength = 1) {
    const now = this.ctx.currentTime;
    if (this.voices.size >= 12 || now - (this.last.get(sound) ?? -100) < 0.075) return;
    this.last.set(sound, now);
    const pitches: Record<Sound, number> = {
      cone: 320,
      barrel: 105,
      crate: 72,
      countdown: 600,
      start: 1000,
      finish: 660,
      best: 880,
      menu: 480,
      garage: 540,
      jump: 220,
      landing: 65,
      positionUp: 780,
      positionDown: 350,
      pass: 240,
      carImpact: 92,
      podium: 1046,
      boost: 330,
      boostEnd: 740,
    };
    const duration = ['finish', 'best', 'podium'].includes(sound)
      ? 0.65
      : ['crate', 'landing', 'boost'].includes(sound)
        ? 0.22
        : 0.11;
    const osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = ['crate', 'barrel'].includes(sound) ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(pitches[sound], now);
    osc.frequency.exponentialRampToValueAtTime(
      pitches[sound] *
        (sound === 'boost' ? 3.4 : sound === 'boostEnd' ? 0.42 : sound === 'best' ? 1.5 : 0.65),
      now + duration,
    );
    gain.gain.setValueAtTime(0.13 * Math.min(1, Math.max(0.15, strength)), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.bus);
    this.voices.add(osc);
    osc.onended = () => {
      this.voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start();
    osc.stop(now + duration);
  }
  dispose() {
    for (const v of this.voices) {
      v.stop();
      v.disconnect();
    }
    this.voices.clear();
  }
}
