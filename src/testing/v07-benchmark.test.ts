import { plannedSpeed } from '../ai/RacingAI';
import { racingLineAt } from '../ai/RacingLine';
import { navAt } from '../ai/TrackNavigation';
import { getVehicle } from '../vehicle/VehicleRegistry';
import { TRACK_LENGTH } from '../track/ActiveTrack';
import { it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { selectTrack } from '../track/ActiveTrack';
import { runCup } from './CupHarness';
it.skipIf(!process.env.APEX_V07_BENCH)(
  'measures equivalent solo Bolt and mixed-car traffic races with official ordered gates',
  async () => {
    await RAPIER.init();
    mkdirSync('test-results/v07', { recursive: true });
    const runs = [];
    if (process.env.APEX_V07_PLAN) {
      const estimates = [];
      for (const track of ['pine', 'coast'] as const) {
        selectTrack(track);
        for (const id of ['bolt', 'vortex', 'sprinter'] as const) {
          const car = getVehicle(id);
          for (const difficulty of ['rookie', 'club', 'pro'] as const) {
            let seconds = 0;
            for (let i = 0; i < 600; i++) {
              const a = navAt(i / 600, racingLineAt(i / 600, difficulty, car).offset),
                b = navAt((i + 1) / 600, racingLineAt((i + 1) / 600, difficulty, car).offset);
              seconds += Math.hypot(b.x - a.x, b.z - a.z) / plannedSpeed(i / 600, car, difficulty);
            }
            estimates.push({
              track,
              id,
              difficulty,
              plannedSeconds: seconds,
              topSpeedLowerBound: TRACK_LENGTH / car.handling.maxSpeed,
            });
          }
        }
      }
      writeFileSync('test-results/v07/planned-pace.json', JSON.stringify(estimates, null, 2));
      console.log(JSON.stringify(estimates));
      return;
    }
    const label = process.env.APEX_V07_BENCH!;
    for (const track of ['pine', 'coast'] as const)
      for (const difficulty of ['rookie', 'club', 'pro'] as const)
        for (const seed of label.includes('matrix') ? [41, 97] : [41])
          for (const solo of label.includes('solo') ? [true] : [true, false]) {
            if (process.env.APEX_V07_TRACK && process.env.APEX_V07_TRACK !== track) continue;
            if (process.env.APEX_V07_DIFFICULTY && process.env.APEX_V07_DIFFICULTY !== difficulty)
              continue;
            if (process.env.APEX_V07_MODE && (process.env.APEX_V07_MODE === 'solo') !== solo)
              continue;
            selectTrack(track);
            const result = runCup(
              difficulty,
              false,
              !solo,
              track === 'pine' ? 500 : 850,
              seed,
              solo
                ? ((process.env.APEX_V07_SOLO_CAR ?? 'bolt') as 'bolt' | 'vortex' | 'sprinter')
                : undefined,
            );
            runs.push({ track, ...result });
            writeFileSync(`test-results/v07/ai-${label}.json`, JSON.stringify(runs, null, 2));
            console.log(
              JSON.stringify({
                track,
                difficulty,
                seed,
                solo,
                resets: result.resets,
                racers: result.racers
                  .slice(1)
                  .map((r) => ({ id: r.id, laps: r.laps, finish: r.finish })),
              }),
            );
            expect(result.resets).toBe(0);
            expect(
              result.metrics
                .slice(1)
                .every((m) => m.invalidSeconds === 0 && m.offroadSeconds === 0),
            ).toBe(true);
            expect(
              result.racers.slice(1).every((r) => r.finish !== null && r.laps.length === 3),
            ).toBe(true);
          }
    selectTrack('pine');
  },
  900000,
);
