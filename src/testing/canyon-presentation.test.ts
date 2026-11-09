import { it, expect } from 'vitest';
import { courseModeLabel, courseProgress, driveLabel } from '../ui/coursePresentation';
import { recordKey, gpRecordKey, defaults, readSave, writeSave } from '../persistence/storage';
it('uses sprint labels without altering existing circuit modes', () => {
  expect(courseModeLabel('time', true)).toBe('Sprint Time Trial');
  expect(courseModeLabel('gp', true)).toBe('Grand Prix Sprint');
  expect(courseModeLabel('time', false)).toBe('Time Attack');
  expect(courseModeLabel('gp', false)).toBe('Grand Prix');
  expect(courseModeLabel('free', true)).toBe('Free Drive');
  expect(driveLabel('canyon')).toBe('Drive Canyon Carnival');
});
it('bounds validated progress and remaining distance without inventing map progress', () => {
  expect(courseProgress(0.5, 5000)).toEqual({ fraction: 0.5, percent: 50, remaining: 2500 });
  expect(courseProgress(1.2, 5000)).toEqual({ fraction: 1, percent: 100, remaining: 0 });
  expect(courseProgress(NaN, 5000)).toEqual({ fraction: 0, percent: 0, remaining: 5000 });
});
it('keeps sprint records and selection across reload independently of circuit lap records', () => {
  const canyon = 'canyon-carnival-1',
    pine = 'pine-valley-v2';
  const save = structuredClone(defaults);
  save.settings.track = 'canyon';
  const sprintKey = recordKey('time', 'bolt', canyon),
    pineKey = recordKey('time', 'bolt', pine),
    cupKey = gpRecordKey('bolt', 'pro', canyon);
  save.records[sprintKey] = { bestLap: 214, bestTotal: 214 };
  save.records[pineKey] = { bestLap: 30, bestTotal: 90 };
  save.gpRecords[cupKey] = {
    bestPosition: 1,
    bestTime: 215,
    bestLap: 215,
    podiums: 1,
    cups: 1,
    history: [{ position: 1, time: 215, bestLap: 215 }],
  };
  let stored = '';
  writeSave(save, {
    setItem: (_, v) => {
      stored = v;
    },
  });
  const restored = readSave({ getItem: () => stored });
  expect(restored.settings.track).toBe('canyon');
  expect(restored.records[sprintKey].bestTotal).toBe(214);
  expect(restored.records[pineKey].bestLap).toBe(30);
  expect(restored.gpRecords[cupKey].bestTime).toBe(215);
  expect(cupKey).toContain('sprint-1');
  expect(sprintKey).toContain('sprint-clean');
});
