# APEX v0.5.1 public playtest

Clean source-only release of the verified v0.5.1 snapshot. All 82 game/source/test files match that snapshot after line-ending normalization. No gameplay, physics, AI, camera, audio or save-format changes were made for publication. Runtime dependency versions are unchanged. Explicit pinned Node 24 development type declarations were added for clean-runner reproducibility.

## Public preparation

- New independent Git repository with generic APEX Development author identity. No original history, branches, tags or .git metadata copied.
- Private specifications, prompts, session guides, development reports, raw captures, logs and profiling artifacts omitted.
- Production and preview base /apex-racing/; local development remains /.
- GitHub-only hosting; main-only Actions with separate build/deploy permissions and official Pages actions.
- Proprietary copyright notice; package license UNLICENSED. Runtime dependency license texts included in THIRD_PARTY_NOTICES.txt and in the deployed site. MIT, BSD, ISC and Apache notices are preserved. No external game-art/audio assets are included. Some npm packages omit license text; their upstream GitHub license texts are reproduced, with source URLs.
- Fresh-checkout test setup creates ignored evidence directory before parallel tests. This resolves an ENOENT report-writing failure without changing a test assertion or game behavior.

## Executed local checks

TypeScript: pass. Tests: 100 passed across 19 files. Production build: pass. Main JS approximately 314 kB; Three approximately 719 kB; Rapier approximately 2.424 MB. Existing embedded-WASM size and Rapier initialization warnings remain.

Production Chrome smoke at the repository subpath: no runtime errors, failed requests or unexpected external requests; no production debug hook. Both circuits run four-car GP countdown/driving/camera/reset/pause/retry. All three garage selections work. Pine Time Attack, Free Drive and Challenge start and return correctly. Audio starts after interaction, uses one context, mutes/resumes and accepts volume changes. Vehicle settings survive reload. Reports and screenshots remain ignored.

## Limits

The public site passed the smoke checks below; These smoke checks do not complete full races, establish personal-best record persistence, benchmark performance, or assess music by listening. The underlying v0.5.1 was previously verified with full races; public full-race completion, other browsers/GPUs, long sessions, high-speed camera comfort and speaker/headphone balance still require manual playtesting. Public and local origins have separate browser saves.

The first GitHub run exposed undeclared Node types used by tests (local ancestor directories had masked this dependency). The public package now declares @types/node explicitly. No runtime bundle content changed.


## Verified public deployment — 2026-11-08

- Site: https://esteves7771.github.io/apex-racing/
- Repository: https://github.com/esteves7771/apex-racing
- Deployed source commit: b9d2d4074644ebb1736472de20362ea922f427e8
- Successful workflow: https://github.com/esteves7771/apex-racing/actions/runs/42498228980
- Stable public deployment tag: v0.5.1-public (separate from the initial source-import tag).
- Actual public Chrome smoke passed: WebGL/Rapier render and driving on both circuits, three garage choices, four-car GP startup, mode startup, audio gesture/mute/resume/volume, camera/reset/pause/retry, browser storage and reload. No runtime errors, failed asset requests or unexpected external requests were observed.
- All five live JS/CSS files were fetched and matched the local production output byte-for-byte. Both legal notice files returned HTTP 200. No hosting-specific rendering/quality reduction was applied. This asset comparison is not a frame-time benchmark.
- The final README/report/publishing-guide update is documentation only and does not change the deployed game. CI is intentionally skipped for that documentation-only commit; all runtime/deployment changes must pass the full release pipeline.

Manual public acceptance: complete a clean three-lap Time Attack and Grand Prix on each track; finish Pine Challenge; reload to verify earned records; compare all three cars in actual driving; check fullscreen/quality/reduced-motion cameras near tunnel portals and the start arch; listen on speakers/headphones; test other browsers/GPUs and long sessions. The browser smoke uses an isolated profile and does not touch existing player saves.
