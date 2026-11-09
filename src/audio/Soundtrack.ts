// Original APEX motifs. Eight-bar D minor progressions; no recordings or external samples.
// Buffer layers deliberately match length and phase. A file-backed source can implement ThemeAsset later.
export interface ThemeAsset {
  bpm: number;
  base: AudioBuffer;
  energy: AudioBuffer;
}
export const compositions = {
  menu: {
    bpm: 104,
    roots: [50, 46, 53, 48],
    motif: [74, 77, 81, 77, 72, 69, 72, 76, 74, 77, 79, 81, 77, 74, 72, 69],
  },
  race: {
    bpm: 116,
    roots: [38, 46, 41, 48],
    motif: [74, 81, 77, 74, 84, 81, 79, 77, 74, 77, 81, 86, 84, 81, 77, 72],
  },
  coast: {
    bpm: 124,
    roots: [48, 53, 45, 55],
    motif: [76, 79, 84, 83, 79, 76, 74, 79, 81, 84, 88, 84, 83, 79, 76, 74],
  },
  // Redline Adventure: original E minor / funk-derived hook with a syncopated bass answer.
  canyon: {
    bpm: 130,
    roots: [40, 45, 43, 47],
    motif: [76, 79, 81, 83, 86, 83, 81, 79, 74, 76, 79, 83, 81, 78, 76, 74],
  },
  challenge: {
    bpm: 132,
    roots: [50, 48, 46, 45],
    motif: [74, 77, 79, 72, 81, 77, 74, 69, 72, 76, 79, 81, 77, 74, 72, 69],
  },
} as const;
export function compose(ctx: AudioContext, name: keyof typeof compositions): ThemeAsset {
  const c = compositions[name],
    rate = 22050,
    beat = 60 / c.bpm,
    duration = beat * 32;
  const base = ctx.createBuffer(1, Math.ceil(duration * rate), rate),
    energy = ctx.createBuffer(1, base.length, rate);
  const a = base.getChannelData(0),
    b = energy.getChannelData(0);
  let seed = 19;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  function note(
    data: Float32Array,
    time: number,
    length: number,
    midi: number,
    volume: number,
    kind: 'pad' | 'bass' | 'lead',
  ) {
    const freq = 440 * 2 ** ((midi - 69) / 12),
      start = Math.round(time * rate),
      count = Math.min(Math.round(length * rate), data.length - start);
    for (let i = 0; i < count; i++) {
      const t = i / rate,
        env = Math.min(1, t / (kind === 'pad' ? 0.15 : 0.012)) * Math.min(1, (length - t) / 0.12),
        p = t * freq * Math.PI * 2;
      const wave =
        name === 'canyon' && kind === 'lead'
          ? Math.sin(p + Math.sin(p * 2) * Math.exp(-t * 8) * 1.4) + Math.sin(p * 0.5) * 0.14
          : Math.sin(p) + Math.sin(p * 2) * 0.22 + Math.sin(p * 3) * 0.08;
      data[start + i] +=
        wave *
        volume *
        env *
        (kind === 'pad' ? 1 : Math.exp(-t * (kind === 'lead' ? (name === 'coast' ? 6 : 3) : 1.8)));
    }
  }
  function drum(data: Float32Array, time: number, kind: 'kick' | 'snare' | 'hat', volume: number) {
    const start = Math.round(time * rate),
      length = kind === 'hat' ? 0.07 : 0.22;
    for (let i = 0; i < length * rate && start + i < data.length; i++) {
      const t = i / rate;
      const wave =
        kind === 'kick'
          ? Math.sin(2 * Math.PI * (48 * t + 8 * (1 - Math.exp(-t * 30))))
          : rand() * 0.8 + Math.sin(t * 2 * Math.PI * 180) * 0.2;
      data[start + i] +=
        wave * Math.exp(-t * (kind === 'hat' ? 75 : kind === 'kick' ? 22 : 30)) * volume;
    }
  }
  for (let bar = 0; bar < 8; bar++) {
    const root = c.roots[Math.floor(bar / 2)],
      time = bar * 4 * beat;
    const minor =
      root % 12 === 2 ||
      root % 12 === 9 ||
      (name === 'canyon' && (root % 12 === 4 || root % 12 === 11));
    const chord = [0, minor ? 3 : 4, 7, minor || root % 12 === 0 ? 10 : 11];
    for (const interval of chord) note(a, time, beat * 3.95, root + 12 + interval, 0.023, 'pad');
    for (let j = 0; j < 8; j++) {
      note(
        a,
        time + (j * beat) / 2,
        beat * 0.43,
        (root < 45 ? root : root - 12) +
          (name === 'canyon' ? [0, 0, 7, 0, 12, 7, 0, 10][j] : j === 6 ? 7 : 0),
        0.095,
        'bass',
      );
      note(
        a,
        time + ((j + (name === 'canyon' && j % 2 ? 0.16 : 0)) * beat) / 2,
        beat * (name === 'canyon' ? 0.42 : 0.65),
        c.motif[(bar * 4 + j) % 16],
        name === 'menu' ? 0.047 : name === 'race' ? 0.043 : name === 'canyon' ? 0.074 : 0.053,
        'lead',
      );
      drum(b, time + (j * beat) / 2, 'hat', 0.035);
    }
    if (name === 'coast') {
      for (const step of [0.75, 1.75, 2.75, 3.5])
        note(b, time + beat * step, beat * 0.23, root + 36, 0.048, 'lead');
    }
    drum(a, time, 'kick', 0.22);
    if (name === 'coast') for (const step of [1, 2, 3]) drum(a, time + beat * step, 'kick', 0.14);
    else drum(a, time + beat * 2.5, 'kick', 0.16);
    drum(a, time + beat, 'snare', name === 'menu' ? 0.045 : name === 'race' ? 0.065 : 0.075);
    drum(a, time + beat * 3, 'snare', name === 'menu' ? 0.045 : name === 'race' ? 0.065 : 0.075);
    if (name === 'canyon') {
      drum(a, time + beat * 0.75, 'kick', 0.16);
      drum(a, time + beat * 2.25, 'kick', 0.18);
      for (const step of [0.25, 1.75, 2.75, 3.25])
        note(b, time + step * beat, beat * 0.22, root + 31, 0.055, 'lead');
    }
    drum(b, time + beat * 1.5, 'kick', 0.15);
    drum(b, time + beat * 3.5, 'snare', 0.08);
    note(b, time + beat * 2, beat * 1.8, root + 31, 0.038, 'lead');
  }
  // Soft-limit the summed voices once during construction, never on the render loop.
  for (const data of [a, b])
    for (let i = 0; i < data.length; i++) {
      const edge = Math.min(1, i / (rate * 0.002), (data.length - 1 - i) / (rate * 0.01));
      data[i] = Math.tanh(data[i]) * edge;
    }
  return { bpm: c.bpm, base, energy };
}
