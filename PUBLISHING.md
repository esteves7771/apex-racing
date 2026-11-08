# Public release workflow

This repository starts with a clean v0.5.1 source snapshot. It contains no private development history. Keep private development independent; never add that repository as a remote or merge its history here.

Develop on a separate branch. Publishing requires explicit release approval. Only main triggers Pages; manual workflow dispatch also refuses other branches. Configure GitHub Settings > Pages > Build and deployment > Source > GitHub Actions. Restrict the github-pages environment to main.

Before each approved release, export only reviewed source files into this clean repository. Do not copy .git, local settings, private documentation, environment files, captures or raw reports. Preserve notices. Review the full diff and staged files; use the repository-local generic Git identity. Run npm ci, npm run check and npm run test:pages. Commit on a development branch and merge the approved release into main.

Inspect Actions > Publish verified APEX and the github-pages deployment result. Test the actual reported page_url with APEX_TEST_URL and npm run test:pages, then manually drive both circuits. Do not report success until the public site is verified.

Rollback without rewriting history: create a branch from main, use git revert on the unwanted public release commits, run the checks, then merge the approved rollback into main. For the first release, disable Pages if it must be withdrawn. Never force-push and never push the private repository.

## Commands for an approved future release

From this public checkout (never from the private development repository):

```sh
git switch -c codex/next-release
# Apply only reviewed, sanitized source changes; do not import private Git history.
npm ci
npm run check
npm run test:pages
git diff
# Stage only intended release files and inspect git diff --cached.
git add <reviewed-files>
git commit -m "Prepare approved APEX release"
git switch main
git merge --ff-only codex/next-release
git push origin main
```

Verify Actions and its actual page_url, then run:

```sh
# Set APEX_TEST_URL to that verified deployment URL in your shell.
npm run test:pages
```

Keep unapproved experiments on their development branch. Do not push main until the release has been approved. After merging, create a new development branch for subsequent work.

To roll back a later faulty release, identify its public commit with git log, then:

```sh
git switch main
git pull --ff-only
git revert <faulty-public-release-commit>
npm run check
npm run test:pages
git push origin main
```

Multiple-release or merge reverts need a reviewed revert plan. Preserve release tags and never force-push. The public repository's first v0.5.1 tag marks the initial source import; subsequent deployment fixes remain in history. Use the verified public checkpoint tag documented in RELEASE.md for restoration.

## v0.6.1 mobile release additions

Reviewed source transfers must include public/manifest.webmanifest and public/icons/ while preserving public/COPYRIGHT.txt and public/THIRD_PARTY_NOTICES.txt. Preserve the public production/preview base /apex-racing/ and development awaitWriteFinish watcher guard. Never replace the Pages configuration blindly with private development configuration.

Additional gates: npm run test:mobile, npm run test:immersive, npm run test:styles, npm run test:vehicles and npm run test:pages-manifest. Browser checks need Playwright Chromium or CHROME_PATH. Run test:pages against the actual deployed URL using APEX_TEST_URL. Test fullscreen/fallbacks and touch on the public site, then create the approved public tag on the verified deployed commit.

The rollback checkpoints remain v0.5.1-public and v0.5.1-rollback-before-v061. Real Android/iOS/install acceptance remains a separate manual playtest; emulation is not physical-device certification.
