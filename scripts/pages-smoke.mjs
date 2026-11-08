import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.APEX_TEST_URL || 'http://127.0.0.1:5199/apex-racing/';
const origin = new URL(base).origin;
let server, browser;
const errors = [], failed = [], unexpected = [], cases = [];
await mkdir('test-results', { recursive: true });
try {
  if (!process.env.APEX_TEST_URL) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5199', '--strictPort'], { windowsHide: true, stdio: 'pipe' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base)).ok) break; } catch {}
      if (i === 99) throw Error('Preview did not start');
      await new Promise(r => setTimeout(r, 200));
    }
  }
  browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(() => {
    const Original = window.AudioContext;
    window.__audioContexts = [];
    window.AudioContext = class extends Original { constructor(...args) { super(...args); window.__audioContexts.push(this); } };
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }); });
  page.on('requestfailed', r => failed.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('request', r => { if (!r.url().startsWith(origin + '/') && !/^(data:|blob:)/.test(r.url())) unexpected.push(r.url()); });
  await page.goto(base);
  await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 90000 });
  assert.equal(await page.evaluate(() => typeof window.apexDebug), 'undefined');
  assert.equal(await page.evaluate(() => window.__audioContexts.length), 0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Audio enabled' }).uncheck();
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => window.__audioContexts.map(c => c.state)), ['suspended']);
  await page.getByRole('checkbox', { name: 'Audio enabled' }).check();
  await page.getByRole('slider', { name: 'music volume', exact: true }).fill('0.25');
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => window.__audioContexts.map(c => c.state)), ['running']);
  await page.getByRole('button', { name: 'Back →', exact: true }).click();
  cases.push('Audio mute/resume, volume and gesture lifecycle');
  for (const car of ['Sprinter', 'Vortex', 'Bolt']) {
    await page.getByRole('button', { name: 'Garage', exact: true }).click();
    await page.getByRole('button', { name: car, exact: true }).click();
    await page.getByRole('button', { name: new RegExp('Use ' + car) }).click();
  }
  for (const track of ['pine', 'coast']) {
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption(track);
    await page.getByRole('button', { name: track === 'pine' ? 'Drive Pine Valley' : 'Drive Coral Coast' }).click();
    await page.getByRole('button', { name: /Grand Prix/ }).click();
    await page.getByRole('button', { name: 'Start Grand Prix' }).click();
    await page.keyboard.down('w');
    await page.waitForTimeout(4800);
    await page.keyboard.up('w');
    assert.ok(Number(await page.locator('.speed strong').innerText()) > 10);
    assert.equal(await page.locator('.minimap circle').count(), 5);
    await page.keyboard.press('c');
    await page.keyboard.press('r');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const clock = await page.locator('.timer').innerText();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.timer').innerText(), clock);
    await page.getByRole('button', { name: 'Restart run' }).click();
    await page.waitForTimeout(200);
    assert.equal(Number(await page.locator('.speed strong').innerText()), 0);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    cases.push(track + ': Grand Prix countdown, driving, rivals, camera, reset, pause and retry');
  }
  for (const mode of ['Time attack', 'Free drive', 'Obstacle Challenge']) {
    await page.getByRole('combobox', { name: 'Circuit', exact: true }).selectOption('pine');
    await page.getByRole('button', { name: 'Drive Pine Valley' }).click();
    await page.getByRole('button', { name: new RegExp(mode) }).click();
    await page.keyboard.down('w'); await page.waitForTimeout(800); await page.keyboard.up('w');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    cases.push(mode + ': startup and return');
  }
  await page.waitForFunction(() => window.__audioContexts.length === 1 && window.__audioContexts[0].state === 'running');
  assert.deepEqual(await page.evaluate(() => window.__audioContexts.map(c => c.state)), ['running']);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('apex.v2')).settings.vehicle === 'bolt'));
  await page.reload();
  await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Garage', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Bolt', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: 'test-results/pages-smoke.png' });
  assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(unexpected, []);
  const report = { passed: true, url: base, cases, allCars: true, audioGestureSingleContext: true, settingsPersistOnReload: true, errors, failed, unexpected, limits: 'Smoke tests do not complete races, verify personal-best persistence, or assess sound quality/performance across hardware.' };
  await writeFile('test-results/pages-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server?.kill(); }
