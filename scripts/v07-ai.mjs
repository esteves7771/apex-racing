import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'src/testing/v07-benchmark.test.ts'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, APEX_V07_BENCH: process.argv[2] || 'release-matrix' },
  },
);
process.exit(result.status ?? 1);
