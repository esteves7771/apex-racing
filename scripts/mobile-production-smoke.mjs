import { dismissMobileWelcome } from './mobile-launch-helper.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const base = process.env.APEX_TEST_URL || 'http://127.0.0.1:5204/apex-racing/';
const server = process.env.APEX_TEST_URL ? undefined : await startServer(5204, true),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const errors = [],
  failed = [],
  runs = [];
try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.goto(base);
  await dismissMobileWelcome(page);
  await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
  assert.equal(await page.evaluate(() => typeof window.apexDebug), 'undefined');
  for (const track of ['pine', 'coast']) {
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption(track);
    await page
      .getByRole('button', { name: track === 'pine' ? 'Drive Pine Valley' : 'Drive Coral Coast' })
      .tap();
    await page.getByRole('button', { name: /Grand Prix/ }).tap();
    await page.getByRole('combobox', { name: 'AI difficulty' }).selectOption('pro');
    await page.getByRole('button', { name: 'Start Grand Prix' }).tap();
    await page.waitForTimeout(3500);
    const cdp = await context.newCDPSession(page),
      box = await page.getByRole('button', { name: 'Accelerate', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
    });
    await page.waitForTimeout(1200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(Number(await page.locator('.speed strong').innerText()) > 15);
    await page.screenshot({ path: `test-results/v06-mobile-gp-${track}.png` });
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    const time = await page.locator('.timer').innerText();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.timer').innerText(), time);
    await page.getByRole('button', { name: 'Restart run' }).tap();
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await page.getByRole('button', { name: 'Main menu', exact: true }).tap();
    runs.push(track);
  }
  await page.screenshot({ path: 'test-results/v06-mobile-production.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await fs.writeFile(
    'test-results/v06-mobile-production.json',
    JSON.stringify(
      { passed: true, emulationOnly: true, runs, errors, failed, devHooksAbsent: true },
      null,
      2,
    ),
  );
  console.log('MOBILE PRODUCTION PASS');
} finally {
  await browser.close();
  server?.kill();
}
