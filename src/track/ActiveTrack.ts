import type { BufferGeometry } from 'three';
import * as pine from './PineValley';
import * as coast from './CoralCoast';
import * as canyon from './CanyonCarnival';
export type TrackId = 'pine' | 'coast' | 'canyon';
// Definitions retain their own geometry and presentation; shared systems consume this narrow contract.
export const tracks = {
  pine: {
    ...pine,
    format: 'circuit' as const,
    gridDistances: [pine.TRACK_LENGTH * 0.008, pine.TRACK_LENGTH * 0.016],
    modes: ['free', 'time', 'gp', 'challenge'],
    ambience: 'forest',
  },
  coast: {
    ...coast,
    format: 'circuit' as const,
    gridDistances: [10.3, 20.6],
    modes: ['free', 'time', 'gp'],
    ambience: 'coastal',
  },
  canyon: {
    ...canyon,
    format: 'sprint' as const,
    gridDistances: [12, 24],
    modes: ['free', 'time', 'gp'],
    ambience: 'canyon',
  },
};
export let trackId: TrackId = 'pine';
export type TrackDefinition = {
  format: 'circuit' | 'sprint';
  ROAD_WIDTH: number;
  terrainGeometry: () => BufferGeometry;
  TRACK_LAYOUT_ID: string;
  gridDistances: number[];
  modes: string[];
  ambience: string;
} & Pick<
  typeof pine,
  | 'samples'
  | 'curve'
  | 'TRACK_LENGTH'
  | 'TRACK_INFO'
  | 'checkpoints'
  | 'trackFeatures'
  | 'nearestTrack'
  | 'surfaceAt'
  | 'poseAt'
  | 'roadHeight'
  | 'crossedGate'
  | 'ribbon'
  | 'terrainHeight'
>;
export let activeTrack: TrackDefinition = tracks.pine;
export let {
  samples,
  curve,
  TRACK_LENGTH,
  TRACK_LAYOUT_ID,
  TRACK_INFO,
  ROAD_WIDTH,
  checkpoints,
  trackFeatures,
} = activeTrack;
const listeners = new Set<() => void>();
export function onTrackChange(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
export function selectTrack(id: TrackId) {
  if (id === trackId) return;
  trackId = id;
  activeTrack = tracks[id];
  ({
    samples,
    curve,
    TRACK_LENGTH,
    TRACK_LAYOUT_ID,
    TRACK_INFO,
    ROAD_WIDTH,
    checkpoints,
    trackFeatures,
  } = activeTrack);
  for (const callback of listeners) callback();
}
export const nearestTrack = (x: number, z: number) => activeTrack.nearestTrack(x, z);
export const surfaceAt = (x: number, z: number) => activeTrack.surfaceAt(x, z);
export const poseAt = (t: number) => activeTrack.poseAt(t);
export const roadHeight = (t: number, lateral = 0) => activeTrack.roadHeight(t, lateral);
export const crossedGate = (
  a: Parameters<typeof pine.crossedGate>[0],
  b: Parameters<typeof pine.crossedGate>[1],
  i: number,
) => activeTrack.crossedGate(a, b, i);
export { coast, canyon };
export function unsafeRoute(t: number) {
  return trackId === 'pine'
    ? t > 0.52 && t < 0.7
    : t > trackFeatures.jump.approach - 0.018 && t < trackFeatures.jump.end + 0.015;
}

import { bankAt as pineBank } from './TrackFeatures';
export const bankAt = (t: number) =>
  trackId === 'canyon' ? canyon.bankAt(t) : trackId === 'pine' ? pineBank(t) : coast.bankAt(t);
