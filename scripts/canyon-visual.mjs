import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startServer } from './server.mjs';
const server = await startServer(5272),
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
const page = await browser.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [],
  measurements = [],
  bootstrap = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) {
    if (r.url().endsWith('/previews/canyon.jpg')) bootstrap.push('Preview not yet generated');
    else errors.push(`${r.status()} ${r.url()}`);
  }
});
await fs.mkdir('test-results/v08/visual', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5272');
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const ui = await import('/src/ui/Interface.tsx'),
      { useGame } = await import('/src/game/store.ts');
    useGame.getState().settings({ quality: 'high', controlsSeen: true, reducedMotion: false });
    ui.changeTrack('canyon');
    ui.startRace('free');
  });
  await page.waitForFunction(() => window.apexDebug?.race.phase === 'RACING');
  await page.addStyleTag({
    content: '.interface,.physics-debug-toggle{visibility:hidden!important}',
  });
  await page.evaluate(() => {
    const d = window.apexDebug;
    d.body().setBodyType(1, true);
    d.performance.enabled = true;
    d.performance.cameraDisabled = true;
    d.performance.visual.children.forEach((c) => {
      c.visible = false;
    });
  });
  for (const [section, t, route] of [
    ['festival', -0.001, 'main'],
    ['serpent', 0.192, 'cliff'],
    ['mine', 0.324, 'main'],
    ['oasis', 0.501, 'main'],
    ['skybridge', 0.657, 'main'],
    ['avalanche', 0.799, 'switchbacks'],
    ['finale', 0.975, 'main'],
  ]) {
    await page.evaluate(
      async ({ t, route }) => {
        const canyon = await import('/src/track/CanyonCarnival.ts'),
          d = window.apexDebug,
          p = canyon.routePose(t, route),
          b = d.body();
        b.setTranslation({ x: p.p.x, y: p.p.y + 0.46, z: p.p.z }, true);
        b.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        d.telemetry.camera = 0;
        const camera = d.performance.visual.__r3f.root.getState().camera,
          target = canyon.routePose(Math.min(1.02, t + 0.014), route).p;
        const height = canyon.tunnelAt(t, route) ? 2.6 : 14;
        camera.position.set(
          p.p.x + Math.sin(p.yaw) * 20,
          p.p.y + height,
          p.p.z + Math.cos(p.yaw) * 20,
        );
        camera.lookAt(target.x, target.y + 1, target.z);
        camera.fov = 50;
        camera.updateProjectionMatrix();
      },
      { t, route },
    );
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `test-results/v08/visual/${section}.png` });
    if (process.env.APEX_CANYON_PERF === '1') {
      await page.evaluate(() => {
        const d = window.apexDebug.performance;
        d.enabled = true;
        d.reset();
      });
      await page.waitForTimeout(2600);
      measurements.push(
        await page.evaluate((section) => {
          const d = window.apexDebug.performance,
            f = d.snapshot().frames.slice(30),
            ms = f.map((x) => x.frameMs).sort((a, b) => a - b);
          d.enabled = true;
          return {
            section,
            frames: f.length,
            p95Ms: ms[Math.floor(ms.length * 0.95)],
            meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
            calls: f.at(-1).calls,
            triangles: f.at(-1).triangles,
            geometry: f.at(-1).geometries,
          };
        }, section),
      );
    }
  }
  // Original scene capture: pose and renderer only, no imported artwork and no interface pixels.
  await page.setViewportSize({ width: 960, height: 540 });
  await page.evaluate(async () => {
    const canyon = await import('/src/track/CanyonCarnival.ts'),
      d = window.apexDebug,
      p = canyon.routePose(0.642),
      b = d.body();
    b.setTranslation({ x: p.p.x, y: p.p.y + 0.46, z: p.p.z }, true);
    b.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const canyon = await import('/src/track/CanyonCarnival.ts'),
      d = window.apexDebug,
      p = canyon.routePose(0.642),
      target = canyon.routePose(0.673).p,
      camera = d.performance.visual.__r3f.root.getState().camera;
    d.performance.enabled = true;
    d.performance.cameraDisabled = true;
    camera.position.set(
      p.p.x + Math.sin(p.yaw) * 34 - Math.cos(p.yaw) * 26,
      p.p.y + 26,
      p.p.z + Math.cos(p.yaw) * 34 + Math.sin(p.yaw) * 26,
    );
    camera.lookAt(target.x, target.y + 4, target.z);
    camera.fov = 50;
    camera.updateProjectionMatrix();
  });
  await page.addStyleTag({
    content: '.interface,.physics-debug-toggle{visibility:hidden!important}',
  });
  await page.waitForTimeout(350);
  await fs.mkdir('public/previews', { recursive: true });
  await page.screenshot({ path: 'public/previews/canyon.jpg', type: 'jpeg', quality: 88 });
  await page.setViewportSize({ width: 1740, height: 864 });
  await page.reload();
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/v08/visual/menu.png' });
  assert.deepEqual(errors, []);
  const cdp = await browser.newBrowserCDPSession(),
    gpu = await cdp.send('SystemInfo.getInfo');
  const report = {
    hardware: gpu.gpu.devices,
    passed: true,
    sectionCaptures: 7,
    originalPreview: 'public/previews/canyon.jpg',
    measurements,
    performanceMeasured: process.env.APEX_CANYON_PERF === '1',
    bootstrap,
    errors,
    limits:
      'Fixed-pose art captures are not full gameplay completion; fixed player body/camera staging does not validate physics; performance is a stationary renderer sample requiring exclusive host window and explicit APEX_CANYON_PERF=1.',
  };
  await fs.writeFile('test-results/v08/visual/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  server.kill();
}
