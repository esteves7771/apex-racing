# APEX v0.5.1

A stylized 3D arcade racing game with Pine Valley Circuit, Coral Coast Rush, three cars, a 3D garage, original procedural music and physical AI opponents.

**[Play APEX online](https://esteves7771.github.io/apex-racing/)** · [Public repository](https://github.com/esteves7771/apex-racing)

## Play

Choose a circuit and car, then Free Drive, Time Attack or Grand Prix. Obstacle Challenge is available on Pine Valley. Time Attack and Grand Prix require three valid laps; visit checkpoints in order. Resetting invalidates the current timed lap.

| Key | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake / reverse when slow |
| A, D / Left, Right | Steer |
| Space | Handbrake drift |
| R | Reset to valid checkpoint |
| C | Chase / eagle camera |
| Escape | Pause / resume |
| Enter | Confirm / restart from results |

Audio begins after interaction. Settings offer reduced motion, graphics options and independent audio volumes. Use a desktop browser with WebGL2; mobile/touch controls are not implemented.

## Local development

Node.js 24 is recommended. Dependencies are pinned.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Production builds use `/apex-racing/`; development uses `/`.

```sh
npm run check
npm run preview
npm run test:pages
```

`test:pages` starts its own production preview. It uses Playwright Chromium; install it with `npx playwright install chromium` or set `CHROME_PATH` to an installed Chromium executable. Set `APEX_TEST_URL` to test an already-running deployment. Browser reports/captures remain ignored.

Stack: React, TypeScript, Vite, Three.js / React Three Fiber, Rapier, Zustand and Web Audio. Game geometry and music are authored procedurally; no third-party game-art or audio files are included. Third-party software notices are included in the repository and deployed site.

## Privacy

Game records and preferences are stored locally in this browser (`localStorage`). No game account, game backend or analytics is included. Browser origins have separate saves, so local development records do not automatically transfer to the public site. GitHub serves the site and processes hosting requests under its own policies. Clearing site data removes local records.

## License

APEX is proprietary. Copyright (c) 2026. All rights reserved. No open-source license is granted for the game. See COPYRIGHT.txt and THIRD_PARTY_NOTICES.txt. Third-party software retains its own licenses.

See RELEASE.md for verification limits and PUBLISHING.md for release and rollback instructions.

