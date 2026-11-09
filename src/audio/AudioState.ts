export type Theme = 'menu' | 'race' | 'challenge' | 'results' | 'coast' | 'canyon';
export function themeFor(phase: string, mode: string, track = 'pine'): Theme {
  return phase === 'RESULTS'
    ? 'results'
    : ['RACING', 'COUNTDOWN', 'PAUSED', 'FINISHING'].includes(phase)
      ? mode === 'challenge'
        ? 'challenge'
        : track === 'canyon'
          ? 'canyon'
          : track === 'coast'
            ? 'coast'
            : 'race'
      : 'menu';
}
export class IntensityState {
  high = false;
  stable = 0;
  step(speed: number, dt: number) {
    const change = this.high ? speed < 22 : speed > 30;
    this.stable = change ? this.stable + dt : 0;
    if (this.stable > 3) {
      this.high = !this.high;
      this.stable = 0;
    }
    return this.high;
  }
}
