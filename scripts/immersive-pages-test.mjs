import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const build = spawnSync(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'build',
    '--base=/apex-racing/',
    '--outDir=test-results/v061-pages',
  ],
  { stdio: 'inherit', windowsHide: true },
);
if (build.status !== 0) throw Error('Pages fixture build failed');
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--outDir',
    'test-results/v061-pages',
    '--base',
    '/apex-racing/',
    '--host',
    '127.0.0.1',
    '--port',
    '5209',
    '--strictPort',
  ],
  { windowsHide: true, stdio: 'pipe' },
);
let browser;
try {
  const url = 'http://127.0.0.1:5209/apex-racing/';
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
  });
  const page = await browser.newPage(),
    fail = [],
    errors = [];
  page.on('response', (r) => {
    if (r.status() >= 400) fail.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
  const manifestURL = await page.locator('link[rel=manifest]').getAttribute('href');
  assert.equal(manifestURL, '/apex-racing/manifest.webmanifest');
  const manifest = await (await fetch(new URL(manifestURL, url))).json();
  assert.equal(new URL(manifest.start_url, new URL(manifestURL, url)).pathname, '/apex-racing/');
  assert.equal(new URL(manifest.scope, new URL(manifestURL, url)).pathname, '/apex-racing/');
  for (const icon of manifest.icons) {
    const r = await fetch(new URL(icon.src, new URL(manifestURL, url)));
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
  }
  assert.equal(
    await page.evaluate(async () =>
      navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    ),
    0,
  );
  assert.deepEqual(fail, []);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/v061-pages.json',
    JSON.stringify({ passed: true, url, manifest, fail, errors, noServiceWorker: true }, null, 2),
  );
  console.log('PAGES SUBPATH PASS');
} finally {
  await browser?.close();
  server.kill();
}
