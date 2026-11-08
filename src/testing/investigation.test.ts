import { beforeAll, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { collisionRun } from './CollisionHarness';
beforeAll(async () => {
  await RAPIER.init();
});
it('records baseline isolation evidence without changing the production physics', () => {
  const results = [0, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES].flatMap((flags) =>
    (['flat', 'terrain', 'road', 'both'] as const).map((surface) => collisionRun(surface, flags)),
  );
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/collision-investigation.json', JSON.stringify(results, null, 2));
  console.log(
    results.map(({ surface, flags, worstLoss, finalSpeed, groundedTicks, events }) => ({
      surface,
      flags,
      worstLoss,
      finalSpeed,
      groundedTicks,
      impacts: events.length,
      first: events[0],
    })),
  );
});
