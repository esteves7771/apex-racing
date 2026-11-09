import { compose, type ThemeAsset } from './Soundtrack';
import { IntensityState, type Theme } from './AudioState';
export class MusicManager {
  assets: Record<string, ThemeAsset>;
  theme: Theme | undefined;
  pending: Theme | undefined;
  active: { sources: AudioBufferSourceNode[]; gain: GainNode; energy: GainNode }[] = [];
  boundary = 0;
  intensity = new IntensityState();
  constructor(
    private ctx: AudioContext,
    private bus: GainNode,
  ) {
    this.assets = {
      menu: compose(ctx, 'menu'),
      coast: compose(ctx, 'coast'),
      canyon: compose(ctx, 'canyon'),
      race: compose(ctx, 'race'),
      challenge: compose(ctx, 'challenge'),
    };
  }
  update(theme: Theme, speed: number, dt: number, finalLap = false) {
    const now = this.ctx.currentTime;
    if (theme !== this.theme) this.pending = theme;
    else this.pending = undefined;
    if (this.pending && now >= this.boundary) this.switch(this.pending);
    const high = this.intensity.step(speed, dt),
      asset = this.assets[this.theme === 'results' ? 'menu' : (this.theme ?? 'menu')];
    if (now >= this.boundary) {
      this.boundary = now + 240 / asset.bpm;
      this.active
        .at(-1)
        ?.energy.gain.setTargetAtTime(
          (high || finalLap) && this.theme !== 'results' ? 0.7 : 0,
          now,
          0.35,
        );
    }
  }
  private switch(theme: Theme) {
    const now = this.ctx.currentTime,
      asset = this.assets[theme === 'results' ? 'menu' : theme];
    for (const old of this.active) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, 0.2);
      for (const s of old.sources) s.stop(now + 1.2);
    }
    this.active = [];
    const gain = this.ctx.createGain(),
      energy = this.ctx.createGain();
    gain.gain.value = 0;
    energy.gain.value = 0;
    gain.connect(this.bus);
    energy.connect(gain);
    const sources = [asset.base, asset.energy].map((buffer, i) => {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(i ? energy : gain);
      source.start(now + 0.025);
      return source;
    });
    gain.gain.setTargetAtTime(
      theme === 'results' ? 0.55 : theme === 'canyon' ? 0.98 : 0.8,
      now,
      0.4,
    );
    // Disconnect outgoing bus nodes once both finite stop events have arrived.
    let ended = 0;
    for (const s of sources)
      s.onended = () => {
        s.disconnect();
        if (++ended === 2) {
          energy.disconnect();
          gain.disconnect();
        }
      };
    this.active.push({ sources, gain, energy });
    this.theme = theme;
    this.pending = undefined;
    this.boundary = now + 240 / asset.bpm;
  }
  dispose() {
    for (const a of this.active) {
      for (const s of a.sources) {
        s.stop();
        s.disconnect();
      }
      a.energy.disconnect();
      a.gain.disconnect();
    }
    this.active = [];
  }
}
