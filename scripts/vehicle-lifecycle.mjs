import { dismissMobileWelcome } from './mobile-launch-helper.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startServer } from './server.mjs';
const label = process.argv[2] || 'after';
const server = await startServer(5200);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const runs = [],
  errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 844, height: 390 } : { width: 1366, height: 768 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || /same key|WebGL.*(error|invalid)/i.test(m.text()))
        errors.push(m.text());
    });
    await page.goto('http://127.0.0.1:5200');
    await dismissMobileWelcome(page);
    await page.getByRole('button', { name: 'Garage', exact: true }).waitFor({ timeout: 60000 });
    const inspect = () =>
      page.evaluate(async () => {
        const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
        const result = [];
        for (const { store } of _roots.values()) {
          const state = store.getState(),
            body = state.scene.getObjectByName('visualBody');
          if (!body) continue;
          const parts = [];
          body.traverse((o) => {
            if (o.isMesh)
              parts.push({
                geometry: o.geometry.type,
                vertices: o.geometry.attributes.position?.count || 0,
                material: o.material.type,
                color: o.material.color?.getHexString(),
                position: o.position.toArray(),
                visible: o.visible,
              });
          });
          result.push({ parts, glError: state.gl.getContext().getError() });
        }
        return result;
      });
    await page.getByRole('button', { name: 'Garage', exact: true }).click();
    await page.getByRole('button', { name: 'Bolt', exact: true }).click();
    await page.waitForTimeout(180);
    const reference = await inspect();
    const expected = JSON.stringify(reference.map((r) => r.parts));
    let mismatches = 0;
    for (let i = 0; i < 16; i++) {
      for (const car of ['Sprinter', 'Vortex', 'Bolt']) {
        await page.getByRole('button', { name: car, exact: true }).click();
        await page.waitForTimeout(i % 2 ? 15 : 100);
      }
      await page.waitForTimeout(80);
      const actual = await inspect();
      if (JSON.stringify(actual.map((r) => r.parts)) !== expected) {
        mismatches++;
        if (mismatches === 1)
          await page.screenshot({
            path: `test-results/v06-bolt-${label}-${mobile ? 'mobile' : 'desktop'}-mismatch.png`,
          });
      }
      if (i % 4 === 3) {
        await page.getByRole('button', { name: /Use Bolt/ }).click();
        if (await page.getByRole('combobox', { name: 'Circuit', exact: true }).isVisible())
          await page
            .getByRole('combobox', { name: 'Circuit', exact: true })
            .selectOption(i % 8 === 3 ? 'coast' : 'pine');
        await page.getByRole('button', { name: /Drive (Pine Valley|Coral Coast)/ }).click();
        await page.getByRole('button', { name: /Free drive/ }).click();
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Main menu', exact: true }).click();
        await page.getByRole('button', { name: 'Garage', exact: true }).click();
        await page.waitForTimeout(150);
      }
    }
    const final = await inspect();
    await page.screenshot({
      path: `test-results/v06-bolt-${label}-${mobile ? 'mobile' : 'desktop'}.png`,
    });
    runs.push({ mobile, cycles: 16, mismatches, reference, final });
    await context.close();
  }
  await fs.writeFile(
    `test-results/v06-bolt-${label}.json`,
    JSON.stringify({ runs, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      runs: runs.map(({ mobile, cycles, mismatches }) => ({ mobile, cycles, mismatches })),
      errors,
    }),
  );
  if (label !== 'before') {
    assert.deepEqual(errors, []);
    assert.ok(runs.every((r) => r.mismatches === 0));
  }
} finally {
  await browser.close();
  server.kill();
}
