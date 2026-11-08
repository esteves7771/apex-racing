import type { Mode } from './RaceStateMachine';
export const modeDefinitions: Record<Mode, { label: string; laps: number; ranked: boolean }> = {
  free: { label: 'Free Drive', laps: 0, ranked: false },
  time: { label: 'Time Attack', laps: 3, ranked: true },
  challenge: { label: 'Obstacle Challenge', laps: 1, ranked: true },
  gp: { label: 'Grand Prix', laps: 3, ranked: true },
};
export const CHALLENGE_LAYOUT = 'pine-slalom-1';
