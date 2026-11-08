// Black-box production race driver: reads the public minimap/HUD and sends ordinary keyboard input.
// The isolated helper contains navigation math only; it never accesses or changes game bodies/state.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { startServer } from './server.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url = process.env.APEX_TEST_URL || 'http://127.0.0.1:5215/',
  server = process.env.APEX_TEST_URL ? undefined : await startServer(5215, true);
const helper = await build({
  stdin: {
    contents: `export {RacingAI,rivals} from './src/ai/RacingAI';export {tracks,selectTrack} from './src/track/ActiveTrack';export {getVehicle} from './src/vehicle/VehicleRegistry';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'APEXTestDriver',
  minify: true,
  platform: 'browser',
});
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  }),
  page = await browser.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [],
  races = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
await fs.mkdir('test-results/v071', { recursive: true });
try {
  await page.goto(url);
  await page.locator('.premium-menu').waitFor({ timeout: 90000 });
  assert.equal(await page.evaluate(() => typeof window.apexDebug), 'undefined');
  await page.addScriptTag({ content: helper.outputFiles[0].text });
  await page.getByRole('button', { name: 'Garage', exact: true }).click();
  await page.getByRole('button', { name: 'Bolt', exact: true }).click();
  await page.getByRole('button', { name: /Use Bolt/ }).click();
  for (const track of (process.env.APEX_TRACKS || 'pine,coast').split(',')) {
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption(track);
    await page
      .getByRole('button', {
        name: track === 'pine' ? 'Drive Pine Valley' : 'Drive Coral Coast',
        exact: false,
      })
      .click();
    await page.getByRole('button', { name: /Time attack/ }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.waitForTimeout(3300);
    if (await page.getByRole('button', { name: 'Got it', exact: true }).count())
      await page.getByRole('button', { name: 'Got it', exact: true }).click();
    await page.evaluate((track) => {
      const { RacingAI, rivals, tracks, selectTrack, getVehicle } = APEXTestDriver;
      selectTrack(track);
      const road = tracks[track],
        xs = road.samples.map((s) => s.p.x),
        zs = road.samples.map((s) => s.p.z),
        minX = Math.min(...xs),
        minZ = Math.min(...zs),
        scale = Math.min(160 / (Math.max(...xs) - minX), 165 / (Math.max(...zs) - minZ));
      const ai = new RacingAI(getVehicle('bolt'), { ...rivals[2], id: 'player' }, 'pro', 41),
        held = new Set();
      let last,
        lastTime = performance.now(),
        yaw = road.poseAt(0.994).yaw,
        command = { throttle: true, brake: false, steer: 0 },
        pwm = 0;
      const key = (code, on) => {
        if (held.has(code) === on) return;
        on ? held.add(code) : held.delete(code);
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true }));
      };
      window.releaseDriver = {
        samples: 0,
        last: null,
        stop: () => {
          clearInterval(window.releaseDriver.interval);
          for (const code of [...held]) key(code, false);
        },
      };
      window.releaseDriver.interval = setInterval(() => {
        const circle = document.querySelector('.minimap svg circle:nth-of-type(2)'),
          hud = document.querySelector('.speed strong');
        if (!circle || !hud || document.querySelector('.cup-wait,.results')) {
          for (const code of [...held]) key(code, false);
          return;
        }
        const p = {
            x: (Number(circle.getAttribute('cx')) - 10) / scale + minX,
            z: (Number(circle.getAttribute('cy')) - 12) / scale + minZ,
          },
          speed = Number(hud.textContent) / 3.6,
          now = performance.now();
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.03) {
          if (last && speed > 2) yaw = Math.atan2(-(p.x - last.x), -(p.z - last.z));
          const dt = Math.min(0.2, (now - lastTime) / 1000);
          command = ai.update({ ...p, yaw, speed, grounded: true }, [], dt);
          last = p;
          lastTime = now;
          window.releaseDriver.samples++;
          window.releaseDriver.last = { t: ai.t, lateral: ai.lateral, speed, state: ai.state };
        }
        // Cap only the test driver requested throttle; the published car and AI remain unmodified.
        key('KeyW', command.throttle && speed < 29);
        key('KeyS', command.brake || speed > 30);
        pwm += Math.abs(command.steer);
        const turn = pwm >= 1;
        if (turn) pwm -= 1;
        key('KeyA', turn && command.steer > 0);
        key('KeyD', turn && command.steer < 0);
      }, 16);
    }, track);
    const start = Date.now();
    while ((await page.locator('.cup-wait,.results').count()) === 0) {
      if (Date.now() - start > 900000)
        throw Error(
          'Production race timeout ' +
            JSON.stringify(await page.evaluate(() => window.releaseDriver.last)),
        );
      await page.waitForTimeout(10000);
      console.log(
        track,
        await page.locator('.timer').innerText(),
        await page.evaluate(() => window.releaseDriver.last),
      );
    }
    await page.evaluate(() => window.releaseDriver.stop());
    const finish = await page
      .locator('.cup-wait')
      .innerText()
      .catch(() => null);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `test-results/v071/production-finish-${track}.png` });
    await page.locator('.results').waitFor({ timeout: 10000 });
    const result = await page.locator('.result-time').innerText();
    assert.ok(result.includes(':'));
    races.push({
      track,
      finish,
      result,
      driver: await page.evaluate(() => ({
        samples: window.releaseDriver.samples,
        last: window.releaseDriver.last,
      })),
    });
    await fs.writeFile(
      'test-results/v071/production-races.json',
      JSON.stringify({ url, races, errors }, null, 2),
    );
    await page.getByRole('button', { name: /Go again/ }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, url, races, errors }));
} finally {
  await browser.close();
  server?.kill();
}
