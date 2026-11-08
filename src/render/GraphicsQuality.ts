export type GraphicsPreset = 'low' | 'medium' | 'high';
export const graphicsPresets = {
  low: { dpr: 1, shadows: false, shadowSize: 512, effects: 'low' },
  medium: { dpr: 1.25, shadows: true, shadowSize: 1024, effects: 'low' },
  high: { dpr: 1.6, shadows: true, shadowSize: 2048, effects: 'full' },
} as const;
export function initialAutoPreset(
  touch: boolean,
  width: number,
  cores = 4,
  memory = 4,
): GraphicsPreset {
  if (touch && (width <= 900 || memory <= 2)) return 'low';
  if (touch || cores < 4) return 'medium';
  return 'high';
}
export function lowerPreset(preset: GraphicsPreset): GraphicsPreset {
  return preset === 'high' ? 'medium' : 'low';
}
/** Robust warm sample; only lower quality at menu boundaries, never change physics. */
export function needsLowerQuality(frameMs: number[]) {
  if (frameMs.length < 240) return false;
  const sorted = frameMs.slice().sort((a, b) => a - b);
  return (
    sorted[Math.floor(sorted.length * 0.95)] > 30 &&
    sorted.reduce((a, b) => a + b, 0) / sorted.length > 24
  );
}
