import { dismissMobileWelcome } from './mobile-launch-helper.mjs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const base = process.env.APEX_STYLE_URL || 'http://127.0.0.1:5207';
const server = process.env.APEX_STYLE_URL
  ? null
  : spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5207', '--strictPort'],
      { windowsHide: true, stdio: 'pipe' },
    );
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const errors = [],
  failed = [],
  rows = [];
try {
  for (const viewport of [
    { width: 1740, height: 864 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const mobile = viewport.width < 1000,
      context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile }),
      page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
    });
    await page.goto(base);
    await dismissMobileWelcome(page);
    await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
    const styles = await page.evaluate(() => ({
      font: getComputedStyle(document.documentElement).fontFamily,
      margin: getComputedStyle(document.body).margin,
      background: getComputedStyle(document.documentElement).backgroundColor,
      menu: getComputedStyle(document.querySelector('.menu')).position,
      button: getComputedStyle(document.querySelector('.primary')).backgroundColor,
      canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(),
      css: [...document.querySelectorAll('style[data-vite-dev-id]')].reduce(
        (s, e) => s + e.textContent.length,
        0,
      ),
    }));
    assert.ok(styles.css > 15000);
    assert.ok(styles.font.includes('Segoe UI'));
    assert.equal(styles.margin, '0px');
    assert.equal(styles.background, 'rgb(20, 58, 56)');
    assert.equal(styles.canvas.width, viewport.width);
    assert.equal(styles.canvas.height, viewport.height);
    await page.screenshot({ path: `test-results/style-after-menu-${viewport.width}.png` });
    if (!mobile) {
      const signature = () =>
        page.evaluate(() => ({
          font: getComputedStyle(document.documentElement).fontFamily,
          margin: getComputedStyle(document.body).margin,
          menu: getComputedStyle(document.querySelector('.menu')).position,
          button: getComputedStyle(document.querySelector('.primary')).backgroundColor,
        }));
      const current = await signature();
      const stable = execFileSync('git', ['show', 'v0.5.1-public:src/app/style.css'], {
        encoding: 'utf8',
      });
      const reference = await page.addStyleTag({ content: stable });
      assert.deepEqual(await signature(), current);
      await reference.evaluate((e) => e.remove());
    }
    await page.getByRole('button', { name: 'Garage', exact: true }).click();
    await page.getByRole('button', { name: 'Bolt', exact: true }).click();
    assert.ok(await page.locator('.showroom canvas').isVisible());
    await page.screenshot({ path: `test-results/style-after-garage-${viewport.width}.png` });
    await page.getByRole('button', { name: /Use Bolt/ }).click();
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption('coast');
    await page.getByRole('button', { name: 'Drive Coral Coast' }).click();
    await page.getByRole('button', { name: /Free drive/ }).click();
    if (mobile) await page.getByRole('button', { name: 'Accelerate', exact: true }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(
      await page
        .locator('canvas')
        .first()
        .evaluate((e) => Math.round(e.getBoundingClientRect().height)),
      viewport.height,
    );
    await page.screenshot({ path: `test-results/style-after-race-${viewport.width}.png` });
    rows.push({ viewport, mobile, styles, baselineDesktopStylesMatch: !mobile });
    await context.close();
  }
  // Exercise the production watcher against a truncate/refill save without touching game source.
  const context = await browser.newContext(),
    page = await context.newPage(),
    file = 'src/app/style-write-probe.css';
  await fs.writeFile(file, ':root { --apex-write-probe: 1; }');
  await page.goto(base);
  await dismissMobileWelcome(page);
  await page.evaluate(() => import('/src/app/style-write-probe.css'));
  const responses = [];
  page.on('response', (r) => {
    if (r.url().includes('style-write-probe.css')) responses.push(r.text());
  });
  await fs.writeFile(file, '');
  await new Promise((r) => setTimeout(r, 80));
  await fs.writeFile(file, ':root { --apex-write-probe: 2; }');
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement).getPropertyValue('--apex-write-probe').trim() ===
      '2',
  );
  const transforms = await Promise.all(responses);
  assert.ok(transforms.length > 0);
  assert.ok(transforms.every((s) => !s.includes('const __vite__css = ""')));
  await context.close();
  await fs.unlink(file);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await fs.writeFile(
    'test-results/style-regression.json',
    JSON.stringify(
      {
        passed: true,
        liveServer: true,
        rows,
        truncateRefill: { gapMs: 80, transforms: transforms.length, emptyTransforms: 0 },
        errors,
        failed,
      },
      null,
      2,
    ),
  );
  console.log('LIVE STYLE REGRESSION PASS');
} finally {
  await browser.close();
  server?.kill();
  await fs.unlink('src/app/style-write-probe.css').catch(() => {});
}
