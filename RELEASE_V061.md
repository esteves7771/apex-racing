# APEX v0.6.1 public mobile playtest

Authorized source-only update of the separate public repository. Private development history, prompts, session guides, machine paths and raw reports are excluded. Generic APEX Development author metadata is retained. Runtime dependency versions and proprietary/third-party notices are unchanged.

## Included

Mobile multi-touch/shared physics, responsive layouts, Auto/Low/Medium/High graphics, stronger physically fair AI, Bolt geometry ownership/reconciliation repair, temporary shader-warmup material ownership, and the development awaitWriteFinish CSS repair. v0.6.1 adds optional gesture-only fullscreen/landscape launch, browser/iPhone fallbacks, Display controls, a persisted welcome preference and relative-scope manifest/icons. No automatic fullscreen on load/focus, forced CSS rotation or service worker was added.

## Release gates

The clean public checkout must pass npm ci, TypeScript, all 113 tests, production build, desktop/mobile browser checks, repeated vehicle selection, fullscreen fallback tests and /apex-racing/ manifest/asset verification before pushing main. The standard suite has two additional opt-in benchmark/diagnostic tests; these are not counted as standard passes.

The pre-transfer local benchmark measured 12 both-track/difficulty/seed races and 36 rival finishes with zero resets. Mean Club/Pro three-lap times improved about 13–18% over v0.5.1 without changing vehicle physics limits. That establishes measured simulation pace, not human difficulty certification. Published source retains those algorithms and regression gates.

Local prepublication verification passed: TypeScript; 113 tests (22 files, two opt-in diagnostics skipped); production build; desktop 1740�864/1920�1080 CSS regression; phone portrait/landscape and tablet multitouch; 16 vehicle-selection cycles on each layout; native Chrome fullscreen plus unsupported/denied/lock-denied/standalone scenarios; production driving on both circuits; Pages manifest/icons; desktop mode/audio smoke. Both runtime-only and full dependency audits reported zero vulnerabilities. No critical browser runtime or asset errors were observed. Physical-device limitations below still apply.

After pushing, verify the actual Actions deployment, live assets and public desktop/touch gameplay before creating v0.6.1-public. The annotated tag records the verified deployed commit; it is never created merely because a push succeeded.

## Remaining acceptance

Chrome phone/tablet emulation and injected API failures are preliminary checks. Actual Android Chrome landscape lock, Android Firefox, iPhone Safari, physical rotation/browser navigation, Home Screen install/update behavior, speakers/headphones, thermal/low-memory behavior and long sessions remain manual. No physical-device verification or universal frame-rate guarantee is claimed. Existing WASM-size and Rapier initialization warnings remain.

## Rollback

v0.5.1-public preserves the previously deployed v0.5.1 code. v0.5.1-rollback-before-v061 preserves the public documentation/source HEAD before this release. No old tag is overwritten.

To roll back this release after review: on main, git revert the public v0.6.1 release commit, rerun checks and browser tests, then push the revert. This restores prior content without rewriting history. Do not force-push or merge private history. The prior release notes are preserved in RELEASE_V051.md.
