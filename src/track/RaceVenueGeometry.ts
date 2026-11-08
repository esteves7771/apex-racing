import * as THREE from 'three';
export interface VenueSurface {
  ROAD_WIDTH: number;
  TRACK_LENGTH: number;
  poseAt: (t: number) => { p: THREE.Vector3; yaw: number };
  surfaceAt: (x: number, z: number) => { height: number };
}
export const PAINT_CLEARANCE = 0.026;
function quad(
  track: VenueSurface,
  position: THREE.Vector3,
  yaw: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  positions: number[],
  colors: number[],
  color: THREE.Color,
) {
  for (const [x, z] of [
    [x0, z0],
    [x0, z1],
    [x1, z0],
    [x1, z1],
  ]) {
    const wx = position.x + Math.cos(yaw) * x + Math.sin(yaw) * z,
      wz = position.z - Math.sin(yaw) * x + Math.cos(yaw) * z;
    positions.push(wx, track.surfaceAt(wx, wz).height + PAINT_CLEARANCE, wz);
    colors.push(color.r, color.g, color.b);
  }
}
function geometry(positions: number[], colors: number[]) {
  const indices = [];
  for (let i = 0; i < positions.length / 3; i += 4)
    indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
// Centred on the official t=0 gate plane; no collider or race-rule changes.
export function finishPaint(track: VenueSurface) {
  const positions: number[] = [],
    colors: number[] = [],
    pose = track.poseAt(0),
    columns = Math.round(track.ROAD_WIDTH),
    size = track.ROAD_WIDTH / columns;
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < columns; col++)
      quad(
        track,
        pose.p,
        pose.yaw,
        -track.ROAD_WIDTH / 2 + col * size,
        -track.ROAD_WIDTH / 2 + (col + 1) * size,
        (row - 1) * size,
        row * size,
        positions,
        colors,
        new THREE.Color((row + col) % 2 ? '#faf7eb' : '#182127'),
      );
  return geometry(positions, colors);
}
export function gridPaint(track: VenueSurface, spawns: { p: THREE.Vector3; yaw: number }[]) {
  const positions: number[] = [],
    colors: number[] = [],
    color = new THREE.Color('#fff2cf');
  for (const s of spawns)
    for (const [x0, x1, z0, z1] of [
      [-1.3, -1.17, -2.35, 2.35],
      [1.17, 1.3, -2.35, 2.35],
      [-1.3, 1.3, -2.35, -2.22],
    ])
      quad(track, s.p, s.yaw, x0, x1, z0, z1, positions, colors, color);
  return geometry(positions, colors);
}
export function raceLightSignal(
  phase: string,
  countdown: number,
  elapsed: number,
  mode: string,
  previousPhase = 'RACING',
) {
  if (mode !== 'gp') return 'off';
  const state = phase === 'PAUSED' ? previousPhase : phase;
  if (state === 'COUNTDOWN') return `red-${Math.max(1, Math.min(3, 4 - Math.ceil(countdown)))}`;
  if (state === 'RACING' && elapsed < 2) return 'go';
  if (state === 'RESULTS' || state === 'FINISHING') return 'finish';
  return 'off';
}
