import { it, expect } from 'vitest';
import { IntensityState, themeFor } from '../audio/AudioState';
import { compositions, compose } from '../audio/Soundtrack';
it('chooses coherent menu, racing, challenge and results states', () => {
  expect(themeFor('MENU', 'time')).toBe('menu');
  expect(themeFor('COUNTDOWN', 'time')).toBe('race');
  expect(themeFor('RACING', 'challenge')).toBe('challenge');
  expect(themeFor('RESULTS', 'challenge')).toBe('results');
  expect(themeFor('PAUSED', 'challenge')).toBe('challenge');
});
it('uses separated speed thresholds and a three-second dwell instead of rapid switching', () => {
  const s = new IntensityState();
  for (let i = 0; i < 40; i++) s.step(i % 2 ? 31 : 29, 0.1);
  expect(s.high).toBe(false);
  for (let i = 0; i < 31; i++) s.step(35, 0.1);
  expect(s.high).toBe(true);
  for (let i = 0; i < 100; i++) s.step(25, 0.1);
  expect(s.high).toBe(true);
  for (let i = 0; i < 31; i++) s.step(20, 0.1);
  expect(s.high).toBe(false);
});
it('defines three original bounded-tempo harmonic themes', () => {
  expect(compositions.menu.bpm).toBeGreaterThanOrEqual(90);
  expect(compositions.race.bpm).toBeLessThanOrEqual(175);
  expect(compositions.challenge.bpm).toBeGreaterThanOrEqual(115);
  for (const c of Object.values(compositions)) {
    expect(c.motif).toHaveLength(16);
    expect(c.roots).toHaveLength(4);
    expect(new Set(c.motif).size).toBeGreaterThan(5);
  }
});
it('renders finite, unclipped, phase-aligned loop layers with quiet endpoints', () => {
  const ctx = {
    createBuffer: (_: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    },
  } as unknown as AudioContext;
  for (const name of ['menu', 'race', 'challenge'] as const) {
    const asset = compose(ctx, name);
    expect(asset.base.length).toBe(asset.energy.length);
    for (const layer of [asset.base, asset.energy]) {
      const data = layer.getChannelData(0);
      let peak = 0,
        sum = 0,
        valid = true;
      for (const x of data) {
        peak = Math.max(peak, Math.abs(x));
        sum += x * x;
        valid &&= Number.isFinite(x);
      }
      expect(valid).toBe(true);
      expect(peak).toBeLessThan(0.95);
      expect(Math.sqrt(sum / data.length)).toBeGreaterThan(0.005);
      expect(Math.abs(data[0] - data.at(-1)!)).toBeLessThan(0.003);
    }
  }
});
