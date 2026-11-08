import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startServer } from './server.mjs';
const server = await startServer(5214),
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
  await page.goto('http://127.0.0.1:5214');
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  for (const track of ['pine', 'coast']) {
    await page.evaluate(async (track) => {
      const ui = await import('/src/ui/Interface.tsx'),
        { useGame } = await import('/src/game/store.ts');
      useGame
        .getState()
        .settings({ quality: 'high', controlsSeen: true, reducedMotion: false, vehicle: 'bolt' });
      ui.changeTrack(track);
      ui.startRace('gp');
    }, track);
    await page.waitForFunction(() => window.apexDebug?.race.phase === 'RACING');
    await page.evaluate(() => {
      const d = window.apexDebug;
      for (const [i, r] of d.gp.racers.entries()) {
        const t = 0.995 - i * 0.006,
          p = d.poseAt(t),
          b = r.body;
        p.p.x += Math.cos(p.yaw) * (i % 2 ? 2.2 : -2.2);
        p.p.z -= Math.sin(p.yaw) * (i % 2 ? 2.2 : -2.2);
        r.progress.laps = [30, 30];
        r.progress.nextGate = 0;
        r.progress.safeGate = d.checkpoints.length - 1;
        r.progress.started = true;
        r.progress.lapStart = 60;
        r.progress.resetPosition(p.p, t);
        b.setTranslation({ x: p.p.x, y: p.p.y + 0.5, z: p.p.z }, true);
        b.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
        b.setLinvel({ x: -Math.sin(p.yaw) * 30, y: 0, z: -Math.cos(p.yaw) * 30 }, true);
        r.ai?.reset(t);
      }
      d.race.elapsed = 90;
    });
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => window.apexDebug.race.phase === 'FINISHING');
    await page.keyboard.up('KeyW');
    const start = await page.evaluate(() => ({
      time: window.apexDebug.race.elapsed,
      p: { ...window.apexDebug.body().translation() },
    }));
    await page.waitForTimeout(650);
    await page.screenshot({ path: `test-results/v071/native-finish-${track}.png` });
    const after = await page.evaluate(() => {
      const d = window.apexDebug,
        root = d.performance.visual.__r3f.root.getState();
      return {
        time: d.race.elapsed,
        p: { ...d.body().translation() },
        fov: root.camera.fov,
        life: root.scene.getObjectByName('decorative-world-life').children.map((m) => m.count),
        audio: d.audio.diagnostics(),
      };
    });
    assert.equal(after.time, start.time);
    assert.ok(Math.hypot(after.p.x - start.p.x, after.p.z - start.p.z) > 3);
    assert.ok(after.fov >= 48 && after.fov <= 59);
    assert.deepEqual(after.life, [12, 12, 12, 6, 12]);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.apexDebug.race.phase), 'PAUSED');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Show results', exact: true }).click();
    await page.waitForFunction(() => window.apexDebug.gp.completed, null, { timeout: 25000 });
    const gp = await page.evaluate(() => ({
      time: window.apexDebug.race.elapsed,
      rivals: window.apexDebug.gp.racers
        .slice(1)
        .map((r) => ({ finish: r.progress.finishTime, resets: r.resets, dnf: r.progress.dnf })),
      audio: window.apexDebug.audio.diagnostics(),
    }));
    assert.equal(gp.time, start.time);
    assert.ok(gp.rivals.every((r) => r.finish !== null && r.resets === 0));
    await page.getByRole('button', { name: 'Race again', exact: false }).click();
    await page.waitForFunction(() => window.apexDebug.race.phase === 'COUNTDOWN');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    // Native-clock active driving sample; no accelerated scheduler or heavy test runner.
    await page.evaluate(async () => {
      (await import('/src/ui/Interface.tsx')).startRace('free');
      window.apexDebug.performance.enabled = true;
      window.apexDebug.performance.reset();
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    const perf = await page.evaluate(() => {
      const d = window.apexDebug,
        frames = d.performance.snapshot().frames.slice(20),
        ms = frames.map((f) => f.frameMs).sort((a, b) => a - b);
      d.performance.enabled = false;
      return {
        p95Ms: ms[Math.floor(ms.length * 0.95)],
        meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
        frames: ms.length,
        speed: d.telemetry.speed,
        calls: frames.at(-1).calls,
        triangles: frames.at(-1).triangles,
      };
    });
    assert.ok(perf.speed > 20);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    cases.push({ track, start, after, gp, perf });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v071/integration.json',
    JSON.stringify({ passed: true, cases, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, cases, errors }));
} finally {
  await browser.close();
  server.kill();
}
