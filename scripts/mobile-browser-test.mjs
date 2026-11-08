import { dismissMobileWelcome } from './mobile-launch-helper.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const server = await startServer(5201),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const errors = [],
  runs = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
  ]) {
    const context = await browser.newContext({
        viewport,
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      }),
      page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || /WebGL.*(error|invalid)/i.test(m.text())) errors.push(m.text());
    });
    await page.goto('http://127.0.0.1:5201');
    await dismissMobileWelcome(page);
    await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const selector = page.getByRole('combobox', { name: 'Circuit', exact: true });
    await selector.selectOption('coast');
    await selector.selectOption('pine');
    await page.screenshot({ path: `test-results/v06-mobile-menu-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Garage', exact: true }).click();
    for (const car of ['Vortex', 'Bolt', 'Sprinter'])
      await page.getByRole('button', { name: car, exact: true }).click();
    await page.screenshot({ path: `test-results/v06-mobile-garage-${viewport.width}.png` });
    await page.getByRole('button', { name: /Use Sprinter/ }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Graphics', { exact: true }).selectOption('medium');
    await page.getByRole('slider', { name: 'Touch steering sensitivity' }).fill('0.8');
    await page.getByRole('button', { name: 'Back →', exact: true }).click();
    await page.getByRole('button', { name: 'Drive Pine Valley' }).click();
    await page.getByRole('button', { name: /Free drive/ }).click();
    await page.getByRole('button', { name: 'Accelerate', exact: true }).waitFor();
    const cdp = await context.newCDPSession(page);
    const point = async (name, id) => {
      const b = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(b && b.width >= 44 && b.height >= 44);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, id, radiusX: 5, radiusY: 5, force: 1 };
    };
    const held = () =>
      page.evaluate(async () => {
        const { touchInput } = await import('/src/input/TouchInput.ts');
        return [...touchInput.pointers.values()].sort();
      });
    const go = await point('Accelerate', 1),
      left = await point('Steer left', 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [go] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [go, left] });
    await page.waitForTimeout(600);
    assert.deepEqual(await held(), ['left', 'throttle']);
    assert.equal(await page.evaluate(() => window.apexDebug.audio.diagnostics().state), 'running');
    assert.equal(await page.evaluate(() => window.apexDebug.audio.diagnostics().creations), 1);
    assert.ok((await page.evaluate(() => window.apexDebug.telemetry.speed)) > 3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [left] });
    assert.deepEqual(await held(), ['throttle']);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual(await held(), []);
    const brake = await point('Brake', 3),
      right = await point('Steer right', 4);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [brake, right] });
    assert.deepEqual(await held(), ['brake', 'right']);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.deepEqual(await held(), []);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForFunction(() => window.apexDebug.audio.diagnostics().state === 'suspended');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: 'Resume →', exact: true }).click();
    await page.waitForFunction(() => window.apexDebug.audio.diagnostics().state === 'running');
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
    );
    await page.waitForFunction(() => window.apexDebug.audio.diagnostics().state === 'suspended');
    assert.deepEqual(await held(), []);
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await page.getByRole('button', { name: 'Resume →', exact: true }).click();
    await page.waitForFunction(() => window.apexDebug.audio.diagnostics().state === 'running');
    const camera = await page.evaluate(() => window.apexDebug.telemetry.camera);
    await page.getByRole('button', { name: 'Switch camera' }).tap();
    assert.equal(await page.evaluate(() => window.apexDebug.telemetry.camera), 1 - camera);
    const before = await page.evaluate(() => ({
      run: window.apexDebug.race.runId,
      reset: window.apexDebug.telemetry.resetSerial,
    }));
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.waitForTimeout(250);
    assert.deepEqual(
      await page.evaluate(() => ({
        run: window.apexDebug.race.runId,
        reset: window.apexDebug.telemetry.resetSerial,
      })),
      before,
    );
    await page.getByRole('button', { name: 'Reset car', exact: true }).tap();
    assert.equal(
      await page.evaluate(() => window.apexDebug.telemetry.resetSerial),
      before.reset + 1,
    );
    await page.screenshot({ path: `test-results/v06-mobile-race-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await page.getByRole('button', { name: 'Restart run' }).tap();
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await page.getByRole('button', { name: 'Main menu', exact: true }).tap();
    await page.reload();
    await dismissMobileWelcome(page);
    await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
    const settings = await page.evaluate(
      () => JSON.parse(localStorage.getItem('apex.v2')).settings,
    );
    assert.equal(settings.quality, 'medium');
    assert.equal(settings.steeringSensitivity, 0.8);
    runs.push({
      viewport,
      multiTouch: true,
      cancellation: true,
      focusPause: true,
      orientationPreservesRun: true,
      cameraResetRetry: true,
      settingsPersist: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v06-mobile-browser.json',
    JSON.stringify({ passed: true, emulationOnly: true, runs, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, runs, errors }));
} finally {
  await browser.close();
  server.kill();
}
