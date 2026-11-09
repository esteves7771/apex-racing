import { it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runCanyon, runCanyonTraffic } from './CanyonHarness';
it.skipIf(!process.env.APEX_CANYON_AI)(
  'physically drives the open sprint with real car forces and authoritative road/barriers',
  async () => {
    await RAPIER.init();
    mkdirSync('test-results/v08', { recursive: true });
    const runs = [];
    if (process.env.APEX_CANYON_TRAFFIC) {
      const difficulty = (process.env.APEX_CANYON_DIFFICULTY || 'club') as
          | 'rookie'
          | 'club'
          | 'pro',
        r = runCanyonTraffic(
          difficulty,
          process.env.APEX_CANYON_ROUTE === 'auto'
            ? undefined
            : process.env.APEX_CANYON_ROUTE || 'main',
          450,
          (process.env.APEX_CANYON_PLAYER || 'sprinter') as 'bolt' | 'sprinter' | 'vortex',
        );
      writeFileSync(
        `test-results/v08/traffic-${difficulty}-${process.env.APEX_CANYON_ROUTE || 'main'}.json`,
        JSON.stringify(r, null, 2),
      );
      console.log(JSON.stringify({ ...r, trace: undefined }));
      expect(r.completed).toBe(true);
      for (const actor of r.racers) {
        if (process.env.APEX_CANYON_PLAYER === 'bolt')
          expect.soft(actor.finish !== null || actor.dnf, actor.id).toBe(true);
        else expect.soft(actor.finish, actor.id).not.toBeNull();
        expect.soft(actor.invalid, actor.id).toBe(false);
        expect.soft(actor.offroad, actor.id).toBeLessThan(0.2);
        expect.soft(actor.recoveries, actor.id).toBe(0);
      }
      return;
    }
    const cars = (process.env.APEX_CANYON_CAR || 'bolt').split(',') as (
      | 'bolt'
      | 'vortex'
      | 'sprinter'
    )[];
    const routes = (process.env.APEX_CANYON_ROUTE || 'main').split(',');
    const difficulty = (process.env.APEX_CANYON_DIFFICULTY || 'pro') as 'rookie' | 'club' | 'pro';
    for (const car of cars)
      for (const route of routes) {
        const r = runCanyon(car, difficulty, route === 'auto' ? undefined : route);
        runs.push(r);
        writeFileSync(
          `test-results/v08/ai-${car}-${difficulty}-${route}.json`,
          JSON.stringify(r, null, 2),
        );
        console.log(JSON.stringify({ ...r, trace: undefined }));
        expect.soft(r.complete).toBe(true);
        expect.soft(r.offroad).toBeLessThan(0.2);
        expect.soft(r.recoveries).toBe(0);
        if (route !== 'main' && route !== 'auto')
          expect.soft(r.routeCoverage[route] ?? 0).toBeGreaterThan(2);
      }
  },
  300000,
);
