import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLevel } from '../src/level';
import { LEVEL_CONTENT } from '../src/levels/content';
import { encodeReplay } from '../src/replay';
import { simulate } from '../src/simulation';
import { solveStage } from '../src/solver';

const parsPath = fileURLToPath(new URL('../src/levels/pars.json', import.meta.url));
const solutionsPath = fileURLToPath(new URL('../src/solutions.json', import.meta.url));

const only = process.argv[2];
if (only !== undefined && !LEVEL_CONTENT.some((content) => content.id === only)) {
  console.error(`unknown level id '${only}'`);
  process.exit(1);
}
const pars: Record<string, number> = JSON.parse(readFileSync(parsPath, 'utf8'));
const solutions: Record<string, unknown> = JSON.parse(readFileSync(solutionsPath, 'utf8'));

let failed = false;
for (const content of LEVEL_CONTENT) {
  if (only !== undefined && content.id !== only) continue;
  const started = Date.now();
  const level = buildLevel({ ...content, parFrames: content.maxFrames });
  const inputs: number[] = [];
  const perStage: number[] = [];
  let expansions = 0;

  for (const [index, stage] of level.stages.entries()) {
    const result = solveStage(stage, { maxFrames: content.maxFrames });
    expansions += result.expansions;
    if (!result.solved) {
      console.error(`FAIL  ${content.id} stage ${index + 1}: ${result.reason}`);
      failed = true;
      break;
    }
    perStage.push(result.inputs.length);
    inputs.push(...result.inputs);
  }
  if (perStage.length !== level.stages.length) continue;

  const run = simulate(level, inputs);
  if (!run.finished || run.deaths !== 0 || run.frames !== inputs.length) {
    console.error(`FAIL  ${content.id}: combined replay does not finish cleanly`, run);
    failed = true;
    continue;
  }
  pars[content.id] = run.frames;
  solutions[content.id] = { replay: encodeReplay(inputs), frames: run.frames, deaths: 0 };
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `ok    ${content.id.padEnd(22)} ${String(run.frames).padStart(5)} frames  stages ${perStage.join('/')}  ${expansions} nodes  ${seconds}s`,
  );
}

const ordered = (record: Record<string, unknown>) =>
  Object.fromEntries(
    LEVEL_CONTENT.filter((content) => content.id in record).map((content) => [
      content.id,
      record[content.id],
    ]),
  );
writeFileSync(parsPath, `${JSON.stringify(ordered(pars), null, 2)}\n`);
writeFileSync(solutionsPath, `${JSON.stringify(ordered(solutions), null, 2)}\n`);
if (failed) process.exitCode = 1;
