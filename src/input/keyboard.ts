import { race, telemetry, useGame } from '../game/store';
export const keys = new Set<string>();
export function controls(held: Set<string>) {
  return {
    throttle: held.has('KeyW') || held.has('ArrowUp'),
    brake: held.has('KeyS') || held.has('ArrowDown'),
    steer:
      Number(held.has('KeyA') || held.has('ArrowLeft')) -
      Number(held.has('KeyD') || held.has('ArrowRight')),
    drift: held.has('Space'),
  };
}
export function installKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.matches('input,select')) return;
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) &&
      ['RACING', 'COUNTDOWN', 'PAUSED'].includes(race.phase)
    )
      e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (race.phase === 'PAUSED') race.resume();
      else race.pause();
      keys.clear();
      useGame.getState().publish();
    }
    if (e.code === 'KeyC') telemetry.camera = 1 - telemetry.camera;
    if (e.code === 'KeyR' && race.phase === 'RACING') telemetry.resetSerial++;
  };
  const up = (e: KeyboardEvent) => keys.delete(e.code);
  const blur = () => {
    keys.clear();
    race.pause();
    useGame.getState().publish();
  };
  const visibility = () => {
    if (document.hidden) blur();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
    keys.clear();
  };
}
