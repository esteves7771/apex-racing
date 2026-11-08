# APEX v0.6.1 — Public mobile playtest

**[Play APEX](https://esteves7771.github.io/apex-racing/)**

A stylized 3D arcade racer with Pine Valley Circuit, Coral Coast Rush, three cars, a 3D garage, original procedural music and physical AI rivals.

## This release

- Touch steering, throttle, brake, drift, camera/reset and pause; responsive phone/tablet menus and HUD.
- Optional phone welcome: Enter Fullscreen Race or Continue in Browser. Landscape is recommended. Display options allow re-entry/exit and a remembered welcome preference. Fullscreen/orientation failures never prevent browser play.
- Relative-scope web app manifest and original app icons. iPhone Safari users can rotate manually or optionally use Share → Add to Home Screen. Installation is optional; no service worker or offline guarantee is included.
- Improved physically fair racing lines, speed/braking planning and passing. No rubber-banding or extra vehicle grip/top speed.
- Fixed intermittent Bolt body rendering and asynchronous shader resource ownership. Development CSS watcher waits for non-atomic writes to settle.

Free Drive, three-lap Time Attack and four-car Grand Prix run on both circuits. Obstacle Challenge is on Pine Valley. Visit checkpoints in order; reset invalidates the timed lap. Audio begins after interaction. Settings offer graphics presets, steering response, reduced motion and independent audio volumes.

| Keyboard | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake / reverse when slow |
| A, D / Left, Right | Steer |
| Space | Handbrake drift |
| R | Reset to valid checkpoint |
| C | Chase / eagle camera |
| Escape | Pause / resume |

On phones, hold GO and a steering button together; BRAKE slows/reverses, DRIFT uses the handbrake, CAM changes view and Ⅱ pauses. Use Display for fullscreen options.

## Development

Node.js 24 is recommended. Dependencies are pinned.

```sh
npm ci
npm run dev
npm run check
npm run test:pages
npm run test:mobile
npm run test:immersive
npm run test:styles
npm run test:vehicles
npm run test:pages-manifest
```

Development uses http://127.0.0.1:5173/. Production and preview use `/apex-racing/`. Build with `npm run build`, then `npm run preview`. Browser checks use Playwright Chromium (`npx playwright install chromium`) or an installed Chromium executable via CHROME_PATH. Raw test reports are ignored. Set APEX_TEST_URL to check the live site with test:pages.

Stack: React, TypeScript, Vite, Three.js / React Three Fiber, Rapier, Zustand and Web Audio. Art and music are authored procedurally. Runtime dependency notices are included in the repository and deployed site.

## Playtest limits

Desktop Chrome, touch emulation and simulated fullscreen failures are tested. **Real Android/iPhone hardware, landscape locking, Home Screen installation/update behavior, thermal/low-memory conditions and long sessions still need manual testing.** No universal mobile FPS or browser-API support is promised. See RELEASE.md for validation details.

## Privacy and license

Records/preferences stay in this browser's localStorage. There is no game account, backend or analytics. Origins have separate saves; localhost records do not transfer to the public site. Clearing site data removes local records. GitHub processes hosting requests under its own policies.

APEX is proprietary. Copyright (c) 2026. All rights reserved. No open-source game license is granted. See COPYRIGHT.txt and THIRD_PARTY_NOTICES.txt; third-party software retains its own licenses.

See PUBLISHING.md for approved release and rollback procedures. The preserved previous release is tagged v0.5.1-public.
