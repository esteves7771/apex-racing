import { spawnSync } from 'node:child_process';
import process from 'node:process';
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this helper with npm run check.');
for (const script of ['typecheck', 'test', 'build']) {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
