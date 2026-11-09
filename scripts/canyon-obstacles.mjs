// Development-only local contact fixtures: seed each approach once, then use real physics and keyboard input.
// This gate verifies obstacle lifecycle/recovery, not valid whole-course completion.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const server = await startServer(5273),
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  }),
  page = await browser.newPage({ viewport: { width: 1740, height: 864 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await fs.mkdir('test-results/v08', { recursive: true });
const snapshot = () =>
  page.evaluate(() => {
    const d = window.apexDebug,
      scene = d.performance.visual.__r3f.root.getState().scene,
      sensors = [],
      solids = [],
      dynamic = new Set();
    d.body().colliderSet.forEach((c) => {
      const b = c.parent(),
        data = b?.userData;
      if (b?.isDynamic()) dynamic.add(b.handle);
      if (data?.kind === 'breakable')
        sensors.push({
          id: data.id,
          enabled: c.isEnabled(),
          sensor: c.isSensor(),
          position: { ...c.translation() },
        });
      if (data?.kind === 'canyon-solid')
        solids.push({ id: data.id, sensor: c.isSensor(), enabled: c.isEnabled() });
    });
    const mesh = scene.getObjectByName('canyon-breakable-crate-0');
    return {
      sensors,
      solids,
      dynamicBodies: dynamic.size,
      crate: {
        visible: mesh.visible,
        broken: !!mesh.userData.broken,
        children: mesh.children.length,
        maxFragmentOffset: Math.max(...mesh.children.map((m) => Math.abs(m.position.x))),
      },
      race: {
        phase: d.race.phase,
        nextGate: d.race.nextGate,
        safeGate: d.race.safeGate,
        laps: [...d.race.laps],
        finish: d.race.finishTime,
        penalty: d.race.penaltyTime,
        progress: d.telemetry.courseProgress,
      },
      speed: d.telemetry.speed,
      reset: d.telemetry.resetSerial,
      position: { ...d.body().translation() },
      crateCue: d.audio.sfx?.last.has('crate'),
      solidCue: d.audio.sfx?.last.has('barrel'),
    };
  });
async function approach(kind) {
  await page.evaluate(async (kind) => {
    const c = await import('/src/track/CanyonCarnival.ts'),
      d = window.apexDebug,
      item = kind === 'crate' ? c.breakables[0] : c.solidObstacles[0],
      p = c.routePose(item.t - 8 / c.TRACK_LENGTH, item.route, item.lateral),
      b = d.body();
    b.setTranslation({ x: p.p.x, y: c.surfaceAt(p.p.x, p.p.z).height + 0.43, z: p.p.z }, true);
    b.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    window.obstacleFixture = { kind, item, pose: p };
  }, kind);
  await page.waitForTimeout(450);
  const before = await snapshot();
  await page.evaluate(() => {
    const d = window.apexDebug,
      p = window.obstacleFixture.pose,
      b = d.body();
    b.setLinvel({ x: -Math.sin(p.yaw) * 13, y: 0, z: -Math.cos(p.yaw) * 13 }, true);
  });
  return before;
}
try {
  await page.goto('http://127.0.0.1:5273');
  await page.locator('.premium-menu').waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const ui = await import('/src/ui/Interface.tsx'),
      { useGame } = await import('/src/game/store.ts');
    useGame.getState().settings({ controlsSeen: true, vehicle: 'bolt', quality: 'high' });
    ui.changeTrack('canyon');
    ui.startRace('free');
  });
  await page.waitForFunction(() => window.apexDebug?.race.phase === 'RACING');
  await page.waitForTimeout(200);
  const initial = await snapshot();
  assert.equal(initial.sensors.length, 14);
  assert.equal(initial.sensors.filter((s) => s.enabled).length, 14);
  assert.equal(initial.solids.length, 4);
  assert.ok(initial.solids.every((s) => !s.sensor && s.enabled));
  const beforeCrate = await approach('crate');
  await page.waitForFunction(
    () => {
      const d = window.apexDebug;
      let broken = false;
      d.body().colliderSet.forEach((c) => {
        if (c.parent()?.userData?.id === 'crate-0' && !c.isEnabled()) broken = true;
      });
      return broken;
    },
    null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(100);
  const broken = await snapshot();
  assert.equal(broken.sensors.find((s) => s.id === 'crate-0').enabled, false);
  assert.equal(broken.crate.broken, true);
  assert.equal(broken.dynamicBodies, initial.dynamicBodies);
  assert.equal(broken.crate.children, 3);
  assert.ok(broken.speed > 5);
  assert.equal(broken.crateCue, true);
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => Math.abs(window.apexDebug.telemetry.speed) < 1.3, null, {
    timeout: 3000,
  });
  await page.keyboard.up('KeyS');
  await page.waitForFunction(
    () =>
      !window.apexDebug.performance.visual.__r3f.root
        .getState()
        .scene.getObjectByName('canyon-breakable-crate-0').visible,
    null,
    { timeout: 5000 },
  );
  const settled = await snapshot();
  assert.equal(settled.crate.visible, false);
  assert.ok(settled.crate.maxFragmentOffset < 2);
  assert.equal(settled.sensors.find((s) => s.id === 'crate-0').enabled, false);
  assert.equal(settled.dynamicBodies, initial.dynamicBodies);
  assert.equal(settled.race.finish, null);
  assert.deepEqual(settled.race.laps, []);
  assert.equal(settled.race.penalty, 0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  await page.waitForFunction(() => window.apexDebug.race.phase === 'RACING');
  await page.waitForTimeout(120);
  const retried = await snapshot();
  assert.equal(retried.sensors.length, 14);
  assert.ok(retried.sensors.every((s) => s.enabled));
  assert.equal(retried.crate.broken, false);
  assert.equal(retried.crate.visible, true);
  assert.ok(retried.crate.maxFragmentOffset <= 0.301);
  const resetPositionError = Math.max(
    ...retried.sensors.map((s) => {
      const p = initial.sensors.find((i) => i.id === s.id).position;
      return Math.hypot(p.x - s.position.x, p.y - s.position.y, p.z - s.position.z);
    }),
  );
  assert.ok(resetPositionError < 0.001);
  // A separate timed-run approach fixture checks that obstacle contact cannot create a result or advance skipped milestones.
  await page.evaluate(async () => {
    (await import('/src/ui/Interface.tsx')).startRace('time');
  });
  await page.waitForFunction(() => window.apexDebug.race.phase === 'RACING');
  const beforeSolid = await approach('solid');
  await page.waitForFunction(() => window.apexDebug.audio.sfx?.last.has('barrel'), null, {
    timeout: 5000,
  });
  await page.waitForTimeout(100);
  const impact = await snapshot();
  assert.equal(impact.solidCue, true);
  assert.ok(Math.abs(impact.speed) < 13 * 0.65, JSON.stringify(impact));
  assert.equal(impact.reset, beforeSolid.reset);
  assert.equal(impact.race.nextGate, beforeSolid.race.nextGate);
  assert.equal(impact.race.finish, null);
  assert.deepEqual(impact.race.laps, []);
  assert.equal(impact.race.penalty, 0);
  assert.ok(impact.race.progress <= 0.120001);
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => window.apexDebug.telemetry.speed < -4, null, { timeout: 5000 });
  await page.waitForTimeout(1100);
  await page.keyboard.up('KeyS');
  const reversed = await snapshot();
  assert.ok(
    Math.hypot(reversed.position.x - impact.position.x, reversed.position.z - impact.position.z) >
      3,
  );
  let recovery;
  for (let i = 0; i < 300; i++) {
    recovery = await page.evaluate(async () => {
      const c = await import('/src/track/CanyonCarnival.ts'),
        d = window.apexDebug,
        p = d.body().translation(),
        q = d.body().rotation(),
        yaw = Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y),
        near = c.projectRoute(p.x, p.z, undefined, 'main'),
        target = c.routePose(near.t + 10 / c.TRACK_LENGTH, 'main', 0),
        error = Math.atan2(
          Math.sin(Math.atan2(-(target.p.x - p.x), -(target.p.z - p.z)) - yaw),
          Math.cos(Math.atan2(-(target.p.x - p.x), -(target.p.z - p.z)) - yaw),
        );
      for (const [code, on] of [
        ['KeyW', d.telemetry.speed < 6],
        ['KeyS', d.telemetry.speed > 7],
        ['KeyA', error > 0.035 && d.telemetry.speed > 1],
        ['KeyD', error < -0.035 && d.telemetry.speed > 1],
      ])
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true }));
      return {
        t: near.t,
        lateral: near.lateral,
        speed: d.telemetry.speed,
        reset: d.telemetry.resetSerial,
        y: p.y,
        next: d.race.nextGate,
        finish: d.race.finishTime,
      };
    });
    if (recovery.t > 0.341 && Math.abs(recovery.lateral) < 2) break;
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => {
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD'])
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  });
  assert.ok(recovery.t > 0.341 && Math.abs(recovery.lateral) < 2, JSON.stringify(recovery));
  assert.equal(recovery.reset, beforeSolid.reset);
  assert.equal(recovery.next, beforeSolid.race.nextGate);
  assert.equal(recovery.finish, null);
  assert.ok(recovery.y > 0);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    fixtureOnly: true,
    initial,
    beforeCrate,
    broken,
    settled,
    retried,
    resetPositionError,
    beforeSolid,
    impact,
    reversed,
    recovery,
    errors,
  };
  await fs.writeFile('test-results/v08/obstacles-browser.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      breakableSensorDisabled: true,
      debrisBounded: true,
      retryRestores14: true,
      solidDeceleration: impact.speed,
      physicalKeyboardRecovery: recovery,
      resetPositionError,
      errors,
    }),
  );
} finally {
  await browser.close();
  server.kill();
}
