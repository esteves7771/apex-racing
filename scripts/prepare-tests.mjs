import { mkdirSync } from 'node:fs';
// Regression fixtures write ignored evidence; create the directory before parallel workers.
mkdirSync('test-results', { recursive: true });
