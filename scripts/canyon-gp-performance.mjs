import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const server = await startServer(5224),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const page = await browser.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5224');
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const ui = await import('/src/ui/Interface.tsx'),
      { useGame } = await import('/src/game/store.ts');
    useGame
      .getState()
      .settings({ vehicle: 'sprinter', difficulty: 'pro', quality: 'high', controlsSeen: true });
    ui.changeTrack('canyon');
    ui.startRace('gp');
  });
  await page.waitForFunction(() => window.apexDebug?.race.phase === 'RACING');
  await page.evaluate(async () => {
    const d = window.apexDebug,
      { CanyonAI } = await import('/src/ai/CanyonAI.ts'),
      { rivals } = await import('/src/ai/RacingAI.ts'),
      { touchInput } = await import('/src/input/TouchInput.ts');
    window.perfDriver = new CanyonAI(d.vehicle(), { ...rivals[2], id: 'player' }, 'pro', 41);
    window.perfDriver.reset(-0.005);
    touchInput.sample = () => {
      const t = d.telemetry,
        p = d.body().translation();
      return window.perfDriver.update(
        {
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: t.yaw,
          speed: t.speed,
          grounded: t.grounded,
          boostRemaining: t.boostRemaining,
        },
        d.gp.traffic(),
      );
    };
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.apexDebug.performance.enabled = true;
    window.apexDebug.performance.reset();
  });
  await page.waitForTimeout(18000);
  const result = await page.evaluate(() => {
    const d = window.apexDebug,
      f = d.performance.snapshot().frames.slice(20),
      ms = f.map((x) => x.frameMs).sort((a, b) => a - b);
    return {
      frames: ms.length,
      p95Ms: ms[Math.floor(ms.length * 0.95)],
      meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
      maxMs: ms.at(-1),
      draws: f.at(-1).calls,
      triangles: f.at(-1).triangles,
      speed: d.telemetry.speed,
      phase: d.race.phase,
      invalid: d.race.invalid,
      progress: d.telemetry.courseProgress,
      racers: d.gp.racers.map((r) => ({
        id: r.id,
        t: r.progress.t,
        invalid: r.progress.invalid,
        resets: r.resets,
      })),
      limits:
        'High1740x864movingGPfirst~kilometre, allfourcarsphysics+threeopponents+ordinarytestdriver; mustrunwithoutheavyconcurrentCPU/GPUtests.',
    };
  });
  assert.equal(result.phase, 'RACING');
  assert.equal(result.invalid, false);
  assert.ok(result.progress > 0.1);
  assert.ok(result.racers.every((r) => !r.invalid && r.resets === 0));
  assert.deepEqual(errors, []);
  await fs.mkdir('test-results/v08', { recursive: true });
  await fs.writeFile(
    'test-results/v08/moving-gp-performance.json',
    JSON.stringify({ passed: true, result, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, result, errors }));
} finally {
  await browser.close();
  server.kill();
}
