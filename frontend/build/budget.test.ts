import { describe, expect, it } from 'vitest';
import { BUDGET, checkBudget, classify } from './budget';

const KB = 1024;

describe('classify', () => {
  it('tells the entry chunk, the game chunk and everything else apart', () => {
    expect(classify('index-DCtt2i9p.js')).toBe('entry');
    expect(classify('runtime-B6QStdBp.js')).toBe('game');
    expect(classify('index-WBkXY7uX.css')).toBe('other');
    expect(classify('something-else.js')).toBe('other');
  });
});

describe('checkBudget', () => {
  it('accepts chunks within the budget', () => {
    const sizes = [
      { name: 'index-a.js', gzipBytes: BUDGET.entryGzipKb * KB },
      { name: 'runtime-a.js', gzipBytes: BUDGET.gameGzipKb * KB },
    ];

    expect(checkBudget(sizes)).toEqual([]);
  });

  it('names the chunk that is too big and by how much', () => {
    const sizes = [
      { name: 'index-a.js', gzipBytes: (BUDGET.entryGzipKb + 10) * KB },
      { name: 'runtime-a.js', gzipBytes: 1 * KB },
    ];

    const problems = checkBudget(sizes);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('index-a.js');
    expect(problems[0]).toContain('10.0 KB');
  });

  it('fails when the entry chunk or the game chunk is missing', () => {
    expect(checkBudget([{ name: 'index-a.js', gzipBytes: KB }])).toEqual([
      'no game chunk (runtime-*.js) was built',
    ]);
    expect(checkBudget([{ name: 'runtime-a.js', gzipBytes: KB }])).toEqual([
      'no entry chunk (index-*.js) was built',
    ]);
  });

  it('fails when Phaser ends up in the entry chunk again', () => {
    const sizes = [
      { name: 'index-a.js', gzipBytes: 330 * KB },
      { name: 'runtime-a.js', gzipBytes: 1 * KB },
    ];

    expect(checkBudget(sizes)).toHaveLength(1);
  });
});
