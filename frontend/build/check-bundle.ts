import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { BUDGET, checkBudget, classify } from './budget';

const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));

const sizes = readdirSync(assets)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, gzipBytes: gzipSync(readFileSync(`${assets}${name}`)).length }));

for (const { name, gzipBytes } of sizes) {
  console.log(
    `${classify(name).padEnd(6)} ${name.padEnd(28)} ${(gzipBytes / 1024).toFixed(1)} KB gzip`,
  );
}
console.log(`budget entry ${BUDGET.entryGzipKb} KB, game ${BUDGET.gameGzipKb} KB`);

const problems = checkBudget(sizes);
for (const problem of problems) console.error(`FAIL  ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);
