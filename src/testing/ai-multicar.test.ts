import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runCup } from './CupHarness';
beforeAll(async () => {
  await RAPIER.init();
  mkdirSync('test-results', { recursive: true });
});
it('Stages D/E: all three physical rivals finish with traffic, a parked player and no resets', () => {
  const r = runCup('club', false, true);
  writeFileSync('test-results/ai-stage-de.json', JSON.stringify(r, null, 2));
  expect(r.resets).toBe(0);
  for (const car of r.racers.slice(1)) expect(car.laps.length).toBe(3);
}, 120000);
it('runs deterministic four-car races at all three difficulties under shared rules', () => {
  const all = [];
  for (const d of ['rookie', 'club', 'pro'] as const) {
    const r = runCup(d, true, true);
    all.push(r);
    writeFileSync('test-results/ai-difficulties.json', JSON.stringify(all, null, 2));
    expect(r.completed).toBe(true);
    expect(r.resets).toBe(0);
    expect(r.racers[0].finish).not.toBeNull();
    for (const car of r.racers) expect(car.finish !== null || car.dnf).toBe(true);
  }
}, 120000);
