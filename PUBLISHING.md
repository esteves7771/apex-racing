# Public release workflow

This repository starts with a clean v0.5.1 source snapshot. It contains no private development history. Keep private development independent; never add that repository as a remote or merge its history here.

Develop on a separate branch. Publishing requires explicit release approval. Only main triggers Pages; manual workflow dispatch also refuses other branches. Configure GitHub Settings > Pages > Build and deployment > Source > GitHub Actions. Restrict the github-pages environment to main.

Before each approved release, export only reviewed source files into this clean repository. Do not copy .git, local settings, private documentation, environment files, captures or raw reports. Preserve notices. Review the full diff and staged files; use the repository-local generic Git identity. Run npm ci, npm run check and npm run test:pages. Commit on a development branch and merge the approved release into main.

Inspect Actions > Publish verified APEX and the github-pages deployment result. Test the actual reported page_url with APEX_TEST_URL and npm run test:pages, then manually drive both circuits. Do not report success until the public site is verified.

Rollback without rewriting history: create a branch from main, use git revert on the unwanted public release commits, run the checks, then merge the approved rollback into main. For the first release, disable Pages if it must be withdrawn. Never force-push and never push the private repository.
