import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
import { dismissMobileWelcome } from './mobile-launch-helper.mjs';
const server = await startServer(5271),
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const errors = [],
  rows = [];
await fs.mkdir('test-results/v08', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1740, height: 864 } }),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('http://127.0.0.1:5271');
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.apexDebug);
  await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption('canyon');
  await page.getByRole('combobox', { name: 'Game mode', exact: true }).selectOption('time');
  assert.equal(
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).locator('option').count(),
    3,
  );
  assert.match(await page.locator('.race-summary').innerText(), /Sprint Time Trial/);
  assert.doesNotMatch(await page.locator('.race-summary').innerText(), /lap/i);
  for (const [width, height] of [
    [1740, 864],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    for (const selector of ['.club-header', '.club-cards', '.club-footer']) {
      const b = await page.locator(selector).boundingBox();
      assert.ok(
        b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1,
        `${selector} clips`,
      );
    }
    rows.push({ width, height, menu: true });
  }
  await page.setViewportSize({ width: 1740, height: 864 });
  await page.getByRole('button', { name: /Drive Canyon Carnival/ }).click();
  await page.getByRole('button', { name: 'Confirm race setup', exact: true }).click();
  await page.waitForFunction(() => window.apexDebug.race.phase === 'RACING');
  if (await page.getByRole('button', { name: 'Got it', exact: true }).count())
    await page.getByRole('button', { name: 'Got it', exact: true }).click();
  assert.match(await page.locator('.timing').innerText(), /SPRINT TIME TRIAL/);
  assert.doesNotMatch(await page.locator('.timing').innerText(), /LAP/);
  assert.match(await page.locator('.sprint-section').innerText(), /Festival Rush/);
  assert.equal(
    await page.locator('progress[aria-label="Sprint progress"]').getAttribute('max'),
    '1',
  );
  // Isolated approach fixture; pad activation itself uses ordinary simulation/vehicle forces.
  await page.evaluate(() => {
    const d = window.apexDebug,
      p = d.poseAt(0.022),
      lane = -2;
    p.p.x += Math.cos(p.yaw) * lane;
    p.p.z -= Math.sin(p.yaw) * lane;
    const b = d.body();
    b.setTranslation(
      { x: p.p.x, y: d.track.surfaceAt(p.p.x, p.p.z).height + 0.43, z: p.p.z },
      true,
    );
    b.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
    b.setLinvel({ x: -Math.sin(p.yaw) * 22, y: 0, z: -Math.cos(p.yaw) * 22 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.apexDebug.telemetry.boostRemaining > 0, null, {
    timeout: 6000,
  });
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() =>
    document.querySelector('.boost-status')?.textContent.includes('BOOST ACTIVE'),
  );
  assert.match(await page.locator('.boost-status').innerText(), /BOOST ACTIVE/);
  await page.screenshot({ path: 'test-results/v08/sprint-hud-boost.png' });
  await page.waitForFunction(() => window.apexDebug.telemetry.boostRemaining === 0, null, {
    timeout: 5000,
  });
  await page.waitForTimeout(120);
  const audio = await page.evaluate(() => ({
    diagnostics: window.apexDebug.audio.diagnostics(),
    boost: window.apexDebug.audio.sfx.last.has('boost'),
    expiry: window.apexDebug.audio.sfx.last.has('boostEnd'),
  }));
  assert.equal(audio.diagnostics.theme, 'canyon');
  assert.equal(audio.diagnostics.creations, 1);
  assert.equal(audio.boost, true);
  assert.equal(audio.expiry, true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Audio enabled' }).uncheck();
  await page.getByRole('slider', { name: 'music volume', exact: true }).fill('0.55');
  await page.getByRole('checkbox', { name: 'Audio enabled' }).check();
  await page.getByRole('button', { name: 'Back →', exact: true }).click();
  await page.getByRole('button', { name: 'Resume →', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.apexDebug.audio.context.state), 'running');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Main menu', exact: true }).click();
  await page.reload();
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  assert.equal(
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).inputValue(),
    'canyon',
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('apex.v2')).settings.music),
    0.55,
  );
  for (const track of ['pine', 'coast']) {
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption(track);
    assert.match(await page.locator('.race-summary').innerText(), /Time Attack.*3 laps/);
    assert.match(await page.locator('.best-card').innerText(), /3 clean laps/);
  }
  await context.close();
  const mobile = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    }),
    phone = await mobile.newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto('http://127.0.0.1:5271');
  await dismissMobileWelcome(phone);
  await phone.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption('canyon');
  await phone.getByRole('button', { name: /Drive Canyon Carnival/ }).tap();
  await phone.getByRole('button', { name: /Free drive/ }).tap();
  await phone.getByRole('button', { name: 'Accelerate', exact: true }).waitFor();
  assert.doesNotMatch(await phone.locator('.timing').innerText(), /LAP/);
  assert.equal(await phone.locator('.sprint-progress .time-row').isVisible(), true);
  assert.equal(await phone.locator('.sprint-section').isVisible(), true);
  const h = await phone.locator('.timing').boundingBox();
  assert.ok(h.x >= 0 && h.y >= 0 && h.x + h.width <= 844 && h.y + h.height <= 390);
  rows.push({ mobile: true, hud: h, distanceVisible: true });
  await mobile.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v08/presentation.json',
    JSON.stringify({ passed: true, rows, audio, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, rows, audio, errors }));
} finally {
  await browser.close();
  server.kill();
}
