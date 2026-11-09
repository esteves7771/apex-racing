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
    contents: `export {RacingAI,rivals} from './src/ai/RacingAI';export {CanyonAI} from './src/ai/CanyonAI';export {tracks,selectTrack} from './src/track/ActiveTrack';export {getVehicle} from './src/vehicle/VehicleRegistry';`,
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
const reportDir = process.env.APEX_RACE_REPORT_DIR || 'test-results/v08';
const playerCircle = '.minimap svg circle[r="4.5"]';
function seconds(text) {
  const m = /^(\d+):(\d{2})\.(\d{3})$/.exec(text.trim());
  assert.ok(m, `Invalid displayed time: ${text}`);
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 1000;
}
async function observation() {
  return page.evaluate((selector) => {
    const marker = document.querySelector(selector);
    return {
      time: document.querySelector('.timer')?.textContent.trim(),
      x: Number(marker?.getAttribute('cx')),
      z: Number(marker?.getAttribute('cy')),
      speed: Number(document.querySelector('.speed strong')?.textContent),
    };
  }, playerCircle);
}
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
await fs.mkdir(reportDir, { recursive: true });
try {
  await page.goto(url);
  await page.locator('.premium-menu').waitFor({ timeout: 90000 });
  assert.equal(await page.evaluate(() => typeof window.apexDebug), 'undefined');
  await page.addScriptTag({ content: helper.outputFiles[0].text });
  await page.getByRole('button', { name: 'Garage', exact: true }).click();
  await page.getByRole('button', { name: 'Bolt', exact: true }).click();
  await page.getByRole('button', { name: /Use Bolt/ }).click();
  for (const track of (process.env.APEX_TRACKS || 'pine,coast')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)) {
    assert.ok(['pine', 'coast', 'canyon'].includes(track), `Unsupported course: ${track}`);
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption(track);
    await page.getByRole('combobox', { name: 'Game mode', exact: true }).selectOption('time');
    await page
      .getByRole('button', {
        name:
          track === 'pine'
            ? 'Drive Pine Valley'
            : track === 'coast'
              ? 'Drive Coral Coast'
              : 'Drive Canyon Carnival',
        exact: false,
      })
      .click();
    await page
      .getByRole('button', { name: track === 'canyon' ? /Sprint Time Trial/ : /Time attack/ })
      .click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.locator('.countdown:not(.go)').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.countdown:not(.go)').waitFor({ state: 'hidden', timeout: 15000 });
    if (await page.getByRole('button', { name: 'Got it', exact: true }).count())
      await page.getByRole('button', { name: 'Got it', exact: true }).click();
    await page.evaluate((track) => {
      const { RacingAI, CanyonAI, rivals, tracks, selectTrack, getVehicle } = APEXTestDriver;
      selectTrack(track);
      const road = tracks[track],
        xs = road.samples.map((s) => s.p.x),
        zs = road.samples.map((s) => s.p.z),
        minX = Math.min(...xs),
        minZ = Math.min(...zs),
        scale = Math.min(160 / (Math.max(...xs) - minX), 165 / (Math.max(...zs) - minZ));
      const ai = new (track === 'canyon' ? CanyonAI : RacingAI)(
          getVehicle('bolt'),
          { ...rivals[2], id: 'player' },
          'pro',
          41,
        ),
        held = new Set();
      if (track === 'canyon') ai.forcedRoute = 'main';
      let last,
        lastTime = performance.now(),
        yaw = road.poseAt(track === 'canyon' ? 0 : 0.994).yaw,
        command = { throttle: true, brake: false, steer: 0 },
        pwm = 0,
        wasBoosting = false;
      const key = (code, on) => {
        if (held.has(code) === on) return;
        on ? held.add(code) : held.delete(code);
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true }));
      };
      window.releaseDriver = {
        samples: 0,
        last: null,
        boostActivations: 0,
        usedRoutes: [],
        stop: () => {
          clearInterval(window.releaseDriver.interval);
          for (const code of [...held]) key(code, false);
        },
      };
      window.releaseDriver.interval = setInterval(() => {
        const circle = document.querySelector('.minimap svg circle[r="4.5"]'),
          hud = document.querySelector('.speed strong');
        if (!circle || !hud || document.querySelector('.cup-wait,.results')) {
          for (const code of [...held]) key(code, false);
          return;
        }
        const p = {
            x: (Number(circle.getAttribute('cx')) - 10) / scale + minX,
            z: (Number(circle.getAttribute('cy')) - 12) / scale + minZ,
          },
          reverse =
            document.querySelector('.speed > span:last-child b')?.textContent.trim() === 'R',
          speed = (Number(hud.textContent) / 3.6) * (reverse ? -1 : 1),
          grounded = document.querySelector('.speed > span')?.textContent.trim() !== 'AIRBORNE',
          boostRemaining = Number(
            /([\d.]+)s/.exec(document.querySelector('.boost-status')?.textContent || '')?.[1] || 0,
          ),
          now = performance.now();
        if (boostRemaining > 0 && !wasBoosting) window.releaseDriver.boostActivations++;
        wasBoosting = boostRemaining > 0;
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.03) {
          if (last && Math.abs(speed) > 2)
            yaw = Math.atan2(-(p.x - last.x), -(p.z - last.z)) + (reverse ? Math.PI : 0);
          const dt = Math.min(0.2, (now - lastTime) / 1000);
          command = ai.update(
            { ...p, yaw, speed, grounded, ...(track === 'canyon' ? { boostRemaining } : {}) },
            [],
            dt,
          );
          last = p;
          lastTime = now;
          window.releaseDriver.samples++;
          window.releaseDriver.last = {
            t: ai.t,
            lateral: ai.lateral,
            speed,
            state: ai.state,
            ...(track === 'canyon' ? { route: ai.route, boostRemaining } : {}),
          };
          window.releaseDriver.usedRoutes = ai.usedRoutes || [];
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
    let lastLog = start;
    while ((await page.locator('.cup-wait,.results').count()) === 0) {
      if (Date.now() - start > 900000)
        throw Error(
          'Production race timeout ' +
            JSON.stringify(await page.evaluate(() => window.releaseDriver.last)),
        );
      await page.waitForTimeout(250);
      if (Date.now() - lastLog >= 10000) {
        lastLog = Date.now();
        console.log(
          track,
          await page.locator('.timer').innerText(),
          await page.evaluate(() => window.releaseDriver.last),
        );
      }
    }
    await page.evaluate(() => window.releaseDriver.stop());
    const beforeCooldown = await observation();
    const finish = await page
      .locator('.cup-wait')
      .innerText()
      .catch(() => null);
    assert.ok(finish, 'Finish cooldown must be observed before results');
    await page.waitForTimeout(700);
    const afterCooldown = await observation();
    assert.equal(afterCooldown.time, beforeCooldown.time, 'Official time must remain frozen');
    assert.ok(
      Math.hypot(afterCooldown.x - beforeCooldown.x, afterCooldown.z - beforeCooldown.z) > 0.05,
      'Vehicle must move beyond finish',
    );
    assert.ok(
      afterCooldown.speed > 0 && afterCooldown.speed < beforeCooldown.speed,
      'Vehicle must slow progressively without freezing',
    );
    await page.screenshot({ path: `${reportDir}/production-finish-${track}.png` });
    await page.locator('.results').waitFor({ timeout: 10000 });
    const result = await page.locator('.result-time').innerText();
    assert.equal(result, beforeCooldown.time, 'Result must match official crossing time');
    assert.ok(finish.includes(result));
    const driver = await page.evaluate(() => ({
      samples: window.releaseDriver.samples,
      last: window.releaseDriver.last,
      boostActivations: window.releaseDriver.boostActivations,
      usedRoutes: window.releaseDriver.usedRoutes,
    }));
    if (track === 'canyon') {
      assert.ok(
        driver.boostActivations > 0,
        'Canyon reference driver must physically use a boost pad',
      );
      assert.deepEqual(driver.usedRoutes, [], 'Reference run must stay on main route');
    }
    const raceEvidence = {
      track,
      finish,
      result,
      seconds: seconds(result),
      cooldown: { before: beforeCooldown, after: afterCooldown },
      driver,
    };
    await page.getByRole('button', { name: /Go again/ }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('.speed strong')?.textContent) === 0,
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    const personalBest = await page.locator('.best-card strong').innerText();
    assert.ok(
      seconds(personalBest) <= seconds(result) + 0.001,
      'Completed result must be recorded',
    );
    await page.reload();
    await page.locator('.premium-menu').waitFor({ timeout: 90000 });
    assert.equal(
      await page.getByRole('combobox', { name: 'Circuit', exact: true }).inputValue(),
      track,
    );
    assert.equal(
      await page.locator('.best-card strong').innerText(),
      personalBest,
      'Personal best must persist across reload',
    );
    assert.match(await page.locator('.car-card h3').innerText(), /Bolt/);
    assert.equal(await page.evaluate(() => typeof window.apexDebug), 'undefined');
    await page.addScriptTag({ content: helper.outputFiles[0].text });
    races.push({ ...raceEvidence, personalBest, persisted: true, retry: true });
    await fs.writeFile(
      `${reportDir}/production-races.json`,
      JSON.stringify({ url, races, errors }, null, 2),
    );
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, url, races, errors }));
} finally {
  await browser.close();
  server?.kill();
}
