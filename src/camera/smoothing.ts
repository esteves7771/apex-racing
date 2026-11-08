export function cameraBlend(dt: number, reducedMotion: boolean) {
  return 1 - Math.exp(-Math.max(0, dt) * (reducedMotion ? 7 : 4));
}
