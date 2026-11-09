import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const s = await startServer(5221),
  b = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const p = await b.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await fs.mkdir('test-results/v08', { recursive: true });
try {
  await p.goto('http://127.0.0.1:5221');
  await p.locator('.premium-menu').waitFor({ timeout: 60000 });
  await p.evaluate(async () => {
    const ui = await import('/src/ui/Interface.tsx'),
      { useGame } = await import('/src/game/store.ts');
    useGame
      .getState()
      .settings({ vehicle: 'sprinter', difficulty: 'club', quality: 'high', controlsSeen: true });
    ui.changeTrack('canyon');
    ui.startRace('gp');
  });
  await p.waitForFunction(() => window.apexDebug?.race.phase === 'RACING');
  await p.evaluate(async () => {
    const d = window.apexDebug,
      { CanyonAI } = await import('/src/ai/CanyonAI.ts'),
      { rivals } = await import('/src/ai/RacingAI.ts'),
      { touchInput } = await import('/src/input/TouchInput.ts');
    window.driver = new CanyonAI(d.vehicle(), { ...rivals[2], id: 'player' }, 'club', 41);
    window.driver.reset(-0.005);
    window.driver.forcedRoute = 'main';
    window.command = { throttle: false, brake: false, steer: 0, drift: false };
    window.originalSample = touchInput.sample;
    touchInput.sample = () => window.command;
    d.performance.scheduler.setFrameloop('never');
    window.step = 0;
  });
  let snap;
  for (let batch = 0; batch < 120; batch++) {
    snap = await p.evaluate(() => {
      const d = window.apexDebug;
      d.performance.scheduler.setFrameloop('never');
      window.step = 0;
      for (let i = 0; i < 300 && ['RACING', 'FINISHING'].includes(d.race.phase); i++) {
        const t = d.telemetry,
          pos = d.body().translation();
        window.command =
          d.race.phase === 'RACING'
            ? window.driver.update(
                {
                  x: pos.x,
                  y: pos.y,
                  z: pos.z,
                  yaw: t.yaw,
                  speed: t.speed,
                  grounded: t.grounded,
                  lateralSpeed: 0,
                  boostRemaining: t.boostRemaining,
                },
                d.gp.traffic(),
              )
            : { throttle: false, brake: false, steer: 0, drift: false };
        d.performance.scheduler.advance((window.step += 1 / 60), true);
      }
      return {
        phase: d.race.phase,
        time: d.race.elapsed,
        finish: d.race.finishTime,
        gates: d.race.safeGate,
        invalid: d.race.invalid,
        progress: d.telemetry.courseProgress,
        t: window.driver.t,
        route: window.driver.route,
        boosts: d.telemetry.boostSerial,
        racers: d.gp.racers.map((r) => ({
          id: r.id,
          time: r.progress.finishTime,
          invalid: r.progress.invalid,
          t: r.progress.t,
          dnf: r.progress.dnf,
          resets: r.resets,
          state: r.ai?.state,
          route: r.ai?.route,
          speed: r.speed,
          y: r.body?.translation().y,
        })),
      };
    });
    if (batch % 10 === 0) console.log(JSON.stringify(snap));
    if (snap.phase === 'RESULTS') break;
  }
  await fs.writeFile(
    'test-results/v08/browser-sprint.json',
    JSON.stringify({ snap, errors }, null, 2),
  );
  assert.equal(snap.phase, 'RESULTS', JSON.stringify(snap));
  assert.equal(snap.invalid, false);
  assert.equal(snap.gates, 7);
  assert.ok(snap.racers.every((r) => r.time !== null && !r.invalid && !r.dnf));
  await p.evaluate(async () => {
    (await import('/src/input/TouchInput.ts')).touchInput.sample = window.originalSample;
    window.apexDebug.performance.scheduler.setFrameloop('always');
    (await import('/src/game/store.ts')).useGame.getState().publish();
  });
  await p.locator('.results').waitFor();
  assert.equal(await p.locator('.classification li').count(), 4);
  await p.getByRole('button', { name: /Race again/ }).click();
  await p.waitForFunction(() => window.apexDebug.race.phase === 'COUNTDOWN');
  assert.equal(
    await p.evaluate(() => window.apexDebug.gp.racers.every((r) => r.progress.finishTime === null)),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, snap, errors }));
} finally {
  await b.close();
  s.kill();
}
