import { touchInput } from './TouchInput';
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
export function clearDrivingInput() {
  keys.clear();
  touchInput.clear();
}
export function drivingInput(dt = 1 / 60) {
  const keyboard = controls(keys),
    touch = touchInput.sample(dt, useGame.getState().save.settings.steeringSensitivity);
  return {
    throttle: keyboard.throttle || touch.throttle,
    brake: keyboard.brake || touch.brake,
    drift: keyboard.drift || touch.drift,
    steer: Math.max(-1, Math.min(1, keyboard.steer + touch.steer)),
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
      clearDrivingInput();
      useGame.getState().publish();
    }
    if (e.code === 'KeyC') telemetry.camera = 1 - telemetry.camera;
    if (e.code === 'KeyR' && race.phase === 'RACING') telemetry.resetSerial++;
  };
  const up = (e: KeyboardEvent) => keys.delete(e.code);
  const blur = () => {
    clearDrivingInput();
    race.pause();
    useGame.getState().publish();
  };
  const visibility = () => {
    if (document.hidden) blur();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  window.addEventListener('pagehide', blur);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pagehide', blur);
    document.removeEventListener('visibilitychange', visibility);
    clearDrivingInput();
  };
}
