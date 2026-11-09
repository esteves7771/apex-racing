import { selectTrack, trackId } from '../track/ActiveTrack';
import { create } from 'zustand';
import { Race } from './RaceStateMachine';
import {
  browserStorage,
  readSave,
  writeSave,
  recordKey,
  gpRecordKey,
  type Settings,
} from '../persistence/storage';
import { getVehicle } from '../vehicle/VehicleRegistry';
export const race = new Race();
export const createVehicleTelemetry = () => ({
  speed: 0,
  courseProgress: 0,
  courseRoute: 'main',
  boostRemaining: 0,
  boostSerial: 0,
  boostExpiredSerial: 0,
  velocityX: 0,
  velocityZ: 0,
  steering: 0,
  drift: false,
  braking: false,
  offroad: false,
  grounded: false,
  yaw: 0,
  x: 0,
  z: 100,
  resetSerial: 0,
  camera: 0,
  airborne: false,
  verticalSpeed: 0,
  acceleration: 0,
  yawRate: 0,
  groundPitch: 0,
  bankAngle: 0,
  landingSerial: 0,
  landingStrength: 0,
  jumpCount: 0,
});
export const telemetry = createVehicleTelemetry();
export const useGame = create<{
  revision: number;
  save: ReturnType<typeof readSave>;
  storageOK: boolean;
  publish: () => void;
  settings: (s: Partial<Settings>) => void;
}>((set, get) => ({
  revision: 0,
  save: readSave(browserStorage()),
  storageOK: true,
  publish: () => set((s) => ({ revision: s.revision + 1 })),
  settings: (s) => {
    const save = { ...get().save, settings: { ...get().save.settings, ...s } };
    const storageOK = writeSave(save, browserStorage());
    set({ save, storageOK });
  },
}));
export function saveRecords() {
  const state = useGame.getState(),
    save = { ...state.save };
  const best = Math.min(...race.laps);
  if (race.mode === 'gp') {
    const time = race.gp.player.progress.finishTime;
    if (time === null) return;
    const key = gpRecordKey(save.settings.vehicle, race.gp.difficulty),
      old = save.gpRecords[key],
      position = race.gp.standings.findIndex((r) => r.id === 'player') + 1;
    race.newRecord = !old || position < old.bestPosition || time < old.bestTime;
    race.improvement = old ? old.bestTime - time : null;
    save.gpRecords = {
      ...save.gpRecords,
      [key]: {
        bestPosition: Math.min(old?.bestPosition ?? 4, position),
        bestTime: Math.min(old?.bestTime ?? Infinity, time),
        bestLap: Math.min(old?.bestLap ?? Infinity, best),
        podiums: (old?.podiums ?? 0) + (position <= 3 ? 1 : 0),
        cups: (old?.cups ?? 0) + (position === 1 ? 1 : 0),
        history: [...(old?.history ?? []), { position, time, bestLap: best }].slice(-12),
      },
    };
    useGame.setState({ save, storageOK: writeSave(save, browserStorage()) });
    return;
  }
  const key = recordKey(race.mode, getVehicle(save.settings.vehicle).id),
    old = save.records[key];
  const total = race.adjustedTime;
  race.newRecord = !old?.bestTotal || total < old.bestTotal;
  race.improvement = old?.bestTotal ? old.bestTotal - total : null;
  save.records = {
    ...save.records,
    [key]: {
      bestLap: Math.min(old?.bestLap ?? Infinity, best),
      bestTotal: Math.min(old?.bestTotal ?? Infinity, total),
    },
  };
  if (trackId === 'pine' && race.mode === 'time' && save.settings.vehicle === 'sprinter') {
    save.bestLap = save.records[key].bestLap;
    save.bestTotal = save.records[key].bestTotal;
  }
  useGame.setState({ save, storageOK: writeSave(save, browserStorage()) });
}

selectTrack(useGame.getState().save.settings.track);
