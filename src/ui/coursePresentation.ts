import type { Mode } from '../game/RaceStateMachine';
import { modeDefinitions } from '../game/Modes';
export function courseModeLabel(mode: Mode, sprint: boolean) {
  return sprint && mode !== 'free' && mode !== 'challenge'
    ? mode === 'gp'
      ? 'Grand Prix Sprint'
      : 'Sprint Time Trial'
    : modeDefinitions[mode].label;
}
export function courseProgress(progress: number, length: number) {
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return {
    fraction,
    percent: Math.floor(fraction * 100),
    remaining: Math.max(0, Math.ceil((1 - fraction) * length)),
  };
}
export const driveLabel = (track: string) =>
  track === 'pine'
    ? 'Drive Pine Valley'
    : track === 'coast'
      ? 'Drive Coral Coast'
      : 'Drive Canyon Carnival';
