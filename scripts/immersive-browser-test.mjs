import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const base = process.env.APEX_TEST_URL || 'http://127.0.0.1:5208';
const server = process.env.APEX_TEST_URL ? undefined : await startServer(5208),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const runs = [],
  errors = [];
try {
  for (const mode of ['real', 'unsupported', 'denied', 'lock-denied', 'standalone']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript(() => {
      const Original = window.AudioContext;
      window.__audioContexts = [];
      window.AudioContext = class extends Original {
        constructor(...args) { super(...args); window.__audioContexts.push(this); }
      };
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    if (mode !== 'real')
      await page.addInitScript((mode) => {
        window.__lockCalls = 0;
        window.__requestCalls = 0;
        if (mode === 'standalone') {
          const original = window.matchMedia;
          window.matchMedia = (q) =>
            q === '(display-mode: standalone)'
              ? { matches: true, addEventListener() {}, removeEventListener() {} }
              : original.call(window, q);
          return;
        }
        if (mode === 'unsupported') {
          Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
          return;
        }
        Object.defineProperty(Element.prototype, 'requestFullscreen', {
          value: async () => {
            window.__requestCalls++;
            if (mode === 'denied') throw Error('denied');
            Object.defineProperty(document, 'fullscreenElement', {
              configurable: true,
              get: () => document.documentElement,
            });
            document.dispatchEvent(new Event('fullscreenchange'));
          },
        });
        Object.defineProperty(screen.orientation, 'lock', {
          value: async () => {
            window.__lockCalls++;
            throw Error('lock denied');
          },
        });
      }, mode);
    await page.goto(base);
    if (mode === 'standalone') {
      await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
      assert.equal(await page.getByRole('dialog', { name: 'APEX mobile welcome' }).count(), 0);
      runs.push({ mode, passed: true });
      await context.close();
      continue;
    }
    const dialog = page.getByRole('dialog', { name: 'APEX mobile welcome' });
    await dialog.waitFor({ timeout: 60000 });
    await page.screenshot({ path: `test-results/v061-welcome-${mode}.png` });
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    await dialog.getByRole('button', { name: 'Enter Fullscreen Race' }).tap();
    await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor();
    const full = await page.evaluate(() => !!document.fullscreenElement);
    if (mode === 'unsupported' || mode === 'denied') assert.equal(full, false);
    if (mode === 'lock-denied') {
      assert.equal(full, true);
      assert.equal(await page.evaluate(() => window.__lockCalls), 1);
    }
    await page.getByRole('button', { name: 'Garage', exact: true }).click();
    await page.getByRole('button', { name: 'Bolt', exact: true }).click();
    await page.getByRole('button', { name: /Use Bolt/ }).click();
    assert.equal(await page.getByRole('dialog', { name: 'APEX mobile welcome' }).count(), 0);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole('button', { name: 'Drive Pine Valley' }).click();
    await page.getByRole('button', { name: /Free drive/ }).click();
    await page.getByRole('button', { name: 'Accelerate', exact: true }).waitFor();
    const cdp = await context.newCDPSession(page),
      box = await page.getByRole('button', { name: 'Accelerate', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(Number(await page.locator('.speed strong').innerText()) > 10);
    assert.equal(await page.evaluate(() => window.__audioContexts.length), 1);
    assert.ok(
      await page.evaluate(
        () =>
          Math.abs(document.querySelector('canvas').getBoundingClientRect().height - innerHeight) <
          2,
      ),
    );
    await page.getByRole('button', { name: 'Display', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show mobile welcome on future visits' }).uncheck();
    await page.getByRole('button', { name: 'Continue in Browser', exact: true }).click();
    await page.getByRole('button', { name: 'Resume →', exact: true }).click();
    await page.screenshot({ path: `test-results/v061-race-${mode}.png` });
    if (mode === 'real' && full) {
      await page.evaluate(() => document.exitFullscreen());
      await page.getByRole('button', { name: 'Resume →', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Display', exact: true }).click();
      await page.getByRole('button', { name: 'Enter Fullscreen Race', exact: true }).tap();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.evaluate(() => document.exitFullscreen());
    }
    await page.reload();
    await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
    assert.equal(await page.getByRole('dialog', { name: 'APEX mobile welcome' }).count(), 0);
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    runs.push({ mode, actualFullscreen: full, passed: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v061-immersive.json',
    JSON.stringify(
      {
        runs,
        errors,
        limits:
          'Chrome desktop emulation. Non-real scenarios inject API stubs; no real Android/iOS installation certification.',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ runs, errors }));
} finally {
  await browser.close();
  server?.kill();
}
