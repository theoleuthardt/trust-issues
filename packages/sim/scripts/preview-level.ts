import { buildLevel } from '../src/level';
import { LEVEL_CONTENT } from '../src/levels/content';
import { previewStage } from '../src/preview';
import { solveStage } from '../src/solver';

const id = process.argv[2];
const solve = process.argv.includes('--solve');

if (id === undefined || id.startsWith('--')) {
  console.error('usage: preview-level.ts <level-id> [--solve]');
  console.error(`levels: ${LEVEL_CONTENT.map((content) => content.id).join(', ')}`);
  process.exit(1);
}

const content = LEVEL_CONTENT.find((candidate) => candidate.id === id);
if (!content) {
  console.error(`unknown level id '${id}'`);
  process.exit(1);
}

const level = buildLevel({ ...content, parFrames: content.maxFrames });
let failed = false;

for (const [index, stage] of level.stages.entries()) {
  console.log(`\n${content.name}, stage ${index + 1} of ${level.stages.length}\n`);
  console.log(previewStage(stage));
  if (!solve) continue;
  const result = solveStage(stage, { maxFrames: content.maxFrames });
  if (result.solved) {
    console.log(`\nsolved in ${result.inputs.length} frames (${result.expansions} nodes)`);
  } else {
    console.log(`\nnot solved: ${result.reason}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
