import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const base = process.env.APEX_TEST_URL || 'http://127.0.0.1:5211';
const server = process.env.APEX_TEST_URL ? undefined : await startServer(5211),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const page = await browser.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [],
  layouts = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
await fs.mkdir('test-results/v07', { recursive: true });
try {
  await page.goto(base);
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  if (!process.env.APEX_TEST_URL)
    await page.evaluate(async () => {
      (await import('/src/game/store.ts')).useGame
        .getState()
        .settings({ quality: 'high', reducedMotion: true, controlsSeen: true });
    });
  for (const [width, height] of [
    [1366, 768],
    [1740, 864],
    [1920, 1080],
    [2560, 1440],
    [2560, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    for (const selector of [
      '.club-header',
      '.club-hero',
      '.club-circuit',
      '.club-cards',
      '.club-footer',
    ]) {
      const b = await page.locator(selector).boundingBox();
      assert.ok(
        b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1,
        `${selector} clips at ${width}`,
      );
    }
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(await page.locator('.club-cards>.club-panel').count(), 5);
    await page.waitForFunction(
      ({ width, height }) => {
        const box = document.querySelector('canvas')?.getBoundingClientRect();
        return box?.width === width && box?.height === height;
      },
      { width, height },
    );
    const canvas = await page.locator('canvas').boundingBox();
    assert.equal(canvas.width, width);
    assert.equal(canvas.height, height);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).margin), '0px');
    layouts.push({ width, height, passed: true });
  }
  await page.setViewportSize({ width: 1740, height: 864 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: 'music volume', exact: true }).fill('0.25');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('apex.v2')).settings.music),
    0.25,
  );
  await page.getByRole('button', { name: 'Circuits', exact: true }).click();
  await page.getByRole('button', { name: /Coral Coast Rush.*km/ }).click();
  assert.equal(
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).inputValue(),
    'coast',
  );
  assert.equal(
    await page
      .getByRole('combobox', { name: 'Game mode', exact: true })
      .locator('option[value=challenge]')
      .isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Garage', exact: true }).click();
  await page.getByRole('button', { name: 'Bolt', exact: true }).click();
  await page.getByRole('button', { name: /Use Bolt/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('.car-portrait').waitFor();
  assert.ok(
    await page.locator('.car-portrait').evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await page.getByRole('combobox', { name: 'Game mode', exact: true }).selectOption('gp');
  await page
    .getByRole('combobox', { name: 'Quick AI difficulty', exact: true })
    .selectOption('pro');
  await page.getByRole('button', { name: 'Drive Coral Coast', exact: false }).click();
  assert.equal(
    await page.getByRole('combobox', { name: 'AI difficulty', exact: true }).inputValue(),
    'pro',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Game mode', exact: true }).selectOption('free');
  await page.getByRole('button', { name: 'Drive Coral Coast', exact: false }).click();
  await page.getByRole('button', { name: 'Confirm race setup', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1700);
  await page.keyboard.up('KeyW');
  assert.ok(Number(await page.locator('.speed strong').innerText()) > 20);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Main menu', exact: true }).click();
  await page.reload();
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  assert.match(await page.locator('.car-card h3').innerText(), /Bolt/);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v07/ui.json',
    JSON.stringify(
      {
        passed: true,
        layouts,
        errors,
        settingsPersist: true,
        garage: true,
        circuits: true,
        modeConfirmation: true,
        keyboardDrive: true,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, layouts, errors }));
} finally {
  await browser.close();
  server?.kill();
}
