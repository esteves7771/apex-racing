export const TRACK_LAYOUT_ID = 'pine-valley-evolution-2';
export const TRACK_INFO = {
  name: 'Pine Valley Circuit',
  edition: 'Evolution',
  difficulty: 'Approachable',
  corners: 'Flowing S · banked sweep · technical chicane',
};
export const trackFeatures = {
  bank: { center: 0.72, halfLength: 0.045, radians: 0.045 },
  jump: {
    approach: 0.585,
    crest: 0.608,
    end: 0.633,
    height: 0.8,
    laneCenter: -3.1,
    laneHalfWidth: 2.55,
    takeoffMinSpeed: 12,
    takeoffVelocity: 3.3,
  },
  landmarks: [
    { t: 0.4, name: 'Split Rock' },
    { t: 0.608, name: 'Pine Leap' },
    { t: 0.74, name: 'Summit View' },
  ],
};
export function smoothstep(a: number, b: number, x: number) {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}
export function bankAt(t: number) {
  const f = trackFeatures.bank,
    u = (t - f.center) / f.halfLength;
  return Math.abs(u) < 1 ? f.radians * Math.cos((u * Math.PI) / 2) ** 2 : 0;
}
export function jumpAt(t: number, lateral: number) {
  const j = trackFeatures.jump;
  if (t <= j.approach || t >= j.end) return 0;
  const rise = t < j.crest ? smoothstep(j.approach, j.crest, t) : 1 - smoothstep(j.crest, j.end, t);
  const lane =
    1 - smoothstep(j.laneHalfWidth * 0.45, j.laneHalfWidth, Math.abs(lateral - j.laneCenter));
  return j.height * rise * lane;
}
