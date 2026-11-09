import { TRACK_LAYOUT_ID as activeLayoutId, type TrackId } from '../track/ActiveTrack';
import { TRACK_LAYOUT_ID } from '../track/TrackFeatures';
import { getVehicle, vehiclePalette, type VehicleId } from '../vehicle/VehicleRegistry';
import { CHALLENGE_LAYOUT } from '../game/Modes';
import type { Mode } from '../game/RaceStateMachine';
import { GP_RULES_ID } from '../game/GrandPrix';
import { difficulties, type Difficulty } from '../ai/RacingAI';
export const gpRecordKey = (vehicle: VehicleId, difficulty: Difficulty, layout = activeLayoutId) =>
  `${layout}/gp/${layout.startsWith('canyon-carnival-') ? 'sprint-1' : GP_RULES_ID}/${difficulty}/${vehicle}`;
export interface CupRecord {
  bestPosition: number;
  bestTime: number;
  bestLap: number;
  podiums: number;
  cups: number;
  history: { position: number; time: number; bestLap: number }[];
}
export const recordKey = (mode: Mode, vehicle: VehicleId, layout = activeLayoutId) =>
  `${layout}/${mode}/${mode === 'challenge' ? CHALLENGE_LAYOUT : layout.startsWith('canyon-carnival-') ? 'sprint-clean' : 'clean'}/${vehicle}`;
export const STORAGE_KEY = 'apex.v2';
export interface Settings {
  color: string;
  quality: 'auto' | 'high' | 'medium' | 'low';
  steeringSensitivity: number;
  immersiveWelcome: boolean;
  reducedMotion: boolean;
  master: number;
  sfx: number;
  music: number;
  vehicle: VehicleId;
  vehicleVolume: number;
  ambient: number;
  muted: boolean;
  effects: 'full' | 'low';
  colors: Partial<Record<VehicleId, string>>;
  controlsSeen: boolean;
  difficulty: Difficulty;
  track: TrackId;
}
export interface RecordTimes {
  bestLap: number | null;
  bestTotal: number | null;
}
export interface Save extends RecordTimes {
  version: 2;
  layoutId: string;
  archives: Record<string, RecordTimes>;
  settings: Settings;
  records: Record<string, RecordTimes>;
  gpRecords: Record<string, CupRecord>;
}
export const defaults: Save = {
  version: 2,
  layoutId: TRACK_LAYOUT_ID,
  archives: {},
  records: {},
  gpRecords: {},
  settings: {
    color: '#f6d35e',
    quality: 'auto',
    steeringSensitivity: 1,
    immersiveWelcome: true,
    reducedMotion: false,
    master: 0.35,
    sfx: 0.6,
    music: 0.45,
    vehicle: 'sprinter',
    vehicleVolume: 0.6,
    ambient: 0.25,
    muted: false,
    effects: 'full',
    colors: {},
    controlsSeen: false,
    difficulty: 'club',
    track: 'pine',
  },
  bestLap: null,
  bestTotal: null,
};
function validTime(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
export function readSave(storage: Pick<Storage, 'getItem'> | undefined): Save {
  try {
    let v;
    try {
      v = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    } catch {}
    if (!v || v.version !== 2) {
      try {
        v = JSON.parse(storage?.getItem('apex.v1') ?? 'null');
      } catch {}
    }
    if (!v || ![1, 2].includes(v.version)) return structuredClone(defaults);
    const result = structuredClone(defaults),
      s = v.settings ?? {};
    if (vehiclePalette.includes(s.color)) result.settings.color = s.color;
    result.settings.vehicle = getVehicle(s.vehicle).id;
    if (s.track === 'coast' || s.track === 'canyon') result.settings.track = s.track;
    if (typeof s.difficulty === 'string' && Object.hasOwn(difficulties, s.difficulty))
      result.settings.difficulty = s.difficulty as Difficulty;
    for (const id of ['sprinter', 'vortex', 'bolt'] as const)
      if (vehiclePalette.includes(s.colors?.[id])) result.settings.colors[id] = s.colors[id];
    if (s.effects === 'low') result.settings.effects = 'low';
    if (['auto', 'low', 'medium', 'high'].includes(s.quality)) result.settings.quality = s.quality;
    if (typeof s.steeringSensitivity === 'number' && Number.isFinite(s.steeringSensitivity))
      result.settings.steeringSensitivity = Math.max(0.5, Math.min(1.5, s.steeringSensitivity));
    for (const k of ['reducedMotion', 'controlsSeen', 'muted', 'immersiveWelcome'] as const)
      if (typeof s[k] === 'boolean') result.settings[k] = s[k];
    for (const k of ['master', 'sfx', 'music', 'vehicleVolume', 'ambient'] as const)
      if (typeof s[k] === 'number' && Number.isFinite(s[k]))
        result.settings[k] = Math.max(0, Math.min(1, s[k]));
    for (const [id, r] of Object.entries(v.archives ?? {}).slice(0, 24))
      if (/^[a-z0-9-]{1,64}$/.test(id) && r && typeof r === 'object') {
        const times = r as RecordTimes;
        result.archives[id] = {
          bestLap: validTime(times.bestLap),
          bestTotal: validTime(times.bestTotal),
        };
      }
    const id = v.version === 1 ? 'pine-valley-v1' : v.layoutId;
    const times = { bestLap: validTime(v.bestLap), bestTotal: validTime(v.bestTotal) };
    if (id === TRACK_LAYOUT_ID) Object.assign(result, times);
    else if (
      typeof id === 'string' &&
      /^[a-z0-9-]{1,64}$/.test(id) &&
      (times.bestLap || times.bestTotal)
    )
      result.archives[id] = times;
    for (const [key, value] of Object.entries(v.records ?? {})) {
      if (
        key.length < 200 &&
        value &&
        typeof value === 'object' &&
        /^(pine-|coral-coast-|canyon-carnival-)/.test(key)
      ) {
        const r = value as RecordTimes;
        result.records[key] = { bestLap: validTime(r.bestLap), bestTotal: validTime(r.bestTotal) };
      }
    }
    const oldKey = recordKey('time', 'sprinter', TRACK_LAYOUT_ID);
    if (!result.records[oldKey] && (result.bestLap || result.bestTotal))
      result.records[oldKey] = { bestLap: result.bestLap, bestTotal: result.bestTotal };
    for (const [key, value] of Object.entries(v.gpRecords ?? {}).slice(0, 200)) {
      const r = value as CupRecord;
      if (
        !r ||
        !/^(pine-|coral-coast-|canyon-carnival-)/.test(key) ||
        key.length > 200 ||
        !Number.isInteger(r.bestPosition) ||
        r.bestPosition < 1 ||
        r.bestPosition > 4 ||
        !validTime(r.bestTime) ||
        !validTime(r.bestLap)
      )
        continue;
      result.gpRecords[key] = {
        bestPosition: r.bestPosition,
        bestTime: r.bestTime,
        bestLap: r.bestLap,
        podiums: Number.isSafeInteger(r.podiums) && r.podiums >= 0 ? r.podiums : 0,
        cups: Number.isSafeInteger(r.cups) && r.cups >= 0 ? r.cups : 0,
        history: Array.isArray(r.history)
          ? r.history
              .filter(
                (h) =>
                  h &&
                  Number.isInteger(h.position) &&
                  h.position >= 1 &&
                  h.position <= 4 &&
                  validTime(h.time) &&
                  validTime(h.bestLap),
              )
              .slice(-12)
          : [],
      };
    }
    return result;
  } catch {
    return structuredClone(defaults);
  }
}
export function writeSave(save: Save, storage: Pick<Storage, 'setItem'> | undefined) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
export function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
