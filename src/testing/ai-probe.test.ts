import { it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { selectTrack } from '../track/ActiveTrack';
import { runCup } from './CupHarness';
import { writeFileSync } from 'node:fs';
it.skipIf(!process.env.APEX_PROBE)(
  'captures crest diagnostics',
  async () => {
    await RAPIER.init();
    selectTrack(process.env.APEX_PROBE === 'pine' ? 'pine' : 'coast');
    writeFileSync(
      `test-results/v06-probe-${process.env.APEX_PROBE}.json`,
      JSON.stringify(
        runCup(process.env.APEX_PROBE === 'pine' ? 'pro' : 'club', false, true, 140, 41),
        null,
        2,
      ),
    );
  },
  120000,
);
