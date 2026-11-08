import { it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync, mkdirSync } from 'node:fs';
import { selectTrack } from '../track/ActiveTrack';
import { runCup } from './CupHarness';
it.skipIf(!process.env.APEX_BENCHMARK)(
  'benchmarks both tracks, three difficulties and deterministic seeds without player reference data',
  async () => {
    await RAPIER.init();
    mkdirSync('test-results', { recursive: true });
    const runs = [];
    for (const track of ['pine', 'coast'] as const)
      for (const difficulty of ['rookie', 'club', 'pro'] as const)
        for (const seed of process.env.APEX_BENCHMARK?.startsWith('trial') ? [41] : [41, 97]) {
          selectTrack(track);
          const r = runCup(difficulty, false, true, track === 'pine' ? 600 : 850, seed);
          runs.push({ track, ...r });
          writeFileSync(
            `test-results/v06-ai-${process.env.APEX_BENCHMARK}.json`,
            JSON.stringify(runs, null, 2),
          );
          console.log(
            'AI BENCHMARK',
            JSON.stringify({
              track,
              difficulty,
              seed,
              resets: r.resets,
              finish: r.racers.slice(1).map((x) => ({ id: x.id, time: x.finish })),
            }),
          );
          expect(r.racers.slice(1).every((x) => x.finish !== null)).toBe(true);
        }
    selectTrack('pine');
  },
  600000,
);
