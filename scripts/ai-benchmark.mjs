import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'src/testing/ai-benchmark.test.ts'],
  { stdio: 'inherit', windowsHide: true, env: { ...process.env, APEX_BENCHMARK: 'final' } },
);
process.exit(result.status ?? 1);
