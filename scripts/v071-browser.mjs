import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const server = await startServer(5213),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const page = await browser.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [],
  cases = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await fs.mkdir('test-results/v071', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5213');
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts');
    useGame
      .getState()
      .settings({ quality: 'high', controlsSeen: true, vehicle: 'bolt', reducedMotion: false });
  });
  for (const track of process.env.APEX_FINISH_ONLY
    ? []
    : (process.env.APEX_TRACKS || 'pine,coast').split(',')) {
    await page.evaluate(async (track) => {
      (await import('/src/ui/Interface.tsx')).changeTrack(track);
      (await import('/src/ui/Interface.tsx')).startRace('time');
    }, track);
    await page.waitForFunction(() => window.apexDebug?.race.phase === 'RACING');
    await page.evaluate(async () => {
      const d = window.apexDebug;
      const { RacingAI, rivals } = await import('/src/ai/RacingAI.ts');
      const { touchInput } = await import('/src/input/TouchInput.ts');
      window.testDriver = new RacingAI(d.vehicle(), { ...rivals[2], id: 'player' }, 'pro', 41);
      window.testDriver.reset(d.nearestTrack(d.telemetry.x, d.telemetry.z).t);
      window.testInput = { throttle: false, brake: false, steer: 0, drift: false };
      window.originalSample = touchInput.sample;
      touchInput.sample = () => window.testInput;
      d.performance.scheduler.setFrameloop('never');
      window.testStep = d.performance.scheduler.elapsed();
    });
    let snap;
    for (let batch = 0; batch < 160; batch++) {
      snap = await page.evaluate(() => {
        const d = window.apexDebug,
          s = d.performance.scheduler;
        for (let i = 0; i < 300 && d.race.phase === 'RACING'; i++) {
          const p = d.body().translation(),
            t = d.telemetry;
          window.testInput = window.testDriver.update(
            {
              x: p.x,
              y: p.y,
              z: p.z,
              yaw: t.yaw,
              speed: t.speed,
              grounded: t.grounded,
              lateralSpeed: 0,
            },
            [],
          );
          s.advance((window.testStep += 1 / 60), true);
        }
        window.testInput = { throttle: false, brake: false, steer: 0, drift: false };
        return {
          phase: d.race.phase,
          time: d.race.elapsed,
          laps: [...d.race.laps],
          invalid: d.race.invalid,
          reset: d.telemetry.resetSerial,
          position: { ...d.body().translation() },
          speed: d.telemetry.speed,
          finish: d.race.finishTime,
        };
      });
      if (snap.phase !== 'RACING') break;
      if (batch % 20 === 0) console.log(track, JSON.stringify(snap));
    }
    assert.equal(snap.phase, 'FINISHING', JSON.stringify(snap));
    assert.equal(snap.laps.length, 3);
    const finish = snap;
    await page.evaluate(async () => {
      (await import('/src/input/TouchInput.ts')).touchInput.sample = window.originalSample;
    });
    await page.evaluate(() => {
      const d = window.apexDebug;
      for (let i = 0; i < 60; i++)
        d.performance.scheduler.advance((window.testStep += 1 / 60), true);
    });
    const after = await page.evaluate(() => ({
      p: { ...window.apexDebug.body().translation() },
      time: window.apexDebug.race.elapsed,
      speed: window.apexDebug.telemetry.speed,
      laps: window.apexDebug.race.laps.length,
    }));
    assert.equal(after.time, finish.time);
    assert.equal(after.laps, 3);
    assert.ok(Math.hypot(after.p.x - finish.position.x, after.p.z - finish.position.z) > 3);
    assert.ok(after.speed > 0);
    await page.evaluate(() => window.apexDebug.performance.scheduler.setFrameloop('always'));
    await page.screenshot({ path: `test-results/v071/finish-${track}.png` });
    await page.waitForFunction(() => window.apexDebug.race.phase === 'RESULTS');
    await page.evaluate(() => (window.apexDebug.performance.enabled = true));
    await page.waitForTimeout(1600);
    const perf = await page.evaluate(() => {
      const d = window.apexDebug,
        frames = d.performance.snapshot().frames.slice(-150),
        ms = frames.map((f) => f.frameMs).sort((a, b) => a - b);
      d.performance.enabled = false;
      return {
        p95Ms: ms[Math.floor(ms.length * 0.95)],
        meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
        frames: ms.length,
      };
    });
    cases.push({ track, finish, after, perf });
    await fs.writeFile(
      `test-results/v071/race-${track}.json`,
      JSON.stringify(cases.at(-1), null, 2),
    );
    await page.getByRole('button', { name: /Go again/ }).click();
    await page.waitForFunction(() => window.apexDebug.race.phase === 'COUNTDOWN');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
  }
  // Real finish crossing fixture: two official laps completed, then physically cross the last gate.
  await page.evaluate(async () => {
    const ui = await import('/src/ui/Interface.tsx');
    ui.changeTrack('pine');
    ui.startRace('gp');
  });
  await page.waitForFunction(() => window.apexDebug.race.phase === 'RACING');
  await page.evaluate(() => {
    const d = window.apexDebug;
    for (const [i, r] of d.gp.racers.entries()) {
      const t = 0.995 - i * 0.006,
        p = d.poseAt(t),
        b = r.body;
      r.progress.laps = [30, 30];
      r.progress.nextGate = 0;
      r.progress.safeGate = d.checkpoints.length - 1;
      r.progress.started = true;
      r.progress.lapStart = 60;
      p.p.x += Math.cos(p.yaw) * (i % 2 ? 2.2 : -2.2);
      p.p.z -= Math.sin(p.yaw) * (i % 2 ? 2.2 : -2.2);
      r.progress.resetPosition(p.p, t);
      b.setTranslation({ x: p.p.x, y: p.p.y + 0.5, z: p.p.z }, true);
      b.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
      b.setLinvel({ x: -Math.sin(p.yaw) * 25, y: 0, z: -Math.cos(p.yaw) * 25 }, true);
      r.ai?.reset(t);
    }
    d.race.elapsed = 90;
  });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.apexDebug.race.phase === 'FINISHING');
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: 'test-results/v071/gp-before-skip.png' });
  const official = await page.evaluate(() => window.apexDebug.gp.player.progress.finishTime);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.apexDebug.race.phase), 'PAUSED');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await page.waitForFunction(() => window.apexDebug.gp.completed, null, { timeout: 25000 });
  const gp = await page.evaluate(() => ({
    time: window.apexDebug.gp.player.progress.finishTime,
    racers: window.apexDebug.gp.racers.map((r) => ({
      finish: r.progress.finishTime,
      dnf: r.progress.dnf,
      t: r.progress.t,
      next: r.progress.nextGate,
      invalid: r.progress.invalid,
      resets: r.resets,
      state: r.ai?.state,
      speed: r.speed,
    })),
  }));
  console.log(JSON.stringify(gp));
  await fs.writeFile('test-results/v071/gp-finish.json', JSON.stringify(gp, null, 2));
  assert.equal(gp.time, official);
  assert.ok(gp.racers.slice(1).every((r) => r.finish !== null));
  cases.push({ gp });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v071/browser.json',
    JSON.stringify({ passed: true, cases, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, cases, errors }));
} finally {
  await browser.close();
  server.kill();
}
