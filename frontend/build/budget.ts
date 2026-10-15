/** Size limits of the production build, gzip, in KiB. */
export const BUDGET = { entryGzipKb: 40, gameGzipKb: 400 } as const;

export interface ChunkSize {
  name: string;
  gzipBytes: number;
}

export type ChunkKind = 'entry' | 'game' | 'other';

/** The menus and everything else load from `index-*.js`, Phaser and the scene from `runtime-*.js`. */
export function classify(name: string): ChunkKind {
  if (/^index-.+\.js$/.test(name)) return 'entry';
  if (/^runtime-.+\.js$/.test(name)) return 'game';
  return 'other';
}

/** Problems of a build against the budget; an empty list means it is within it. */
export function checkBudget(sizes: readonly ChunkSize[]): string[] {
  const problems: string[] = [];
  const limits = { entry: BUDGET.entryGzipKb, game: BUDGET.gameGzipKb } as const;
  const found = { entry: false, game: false };

  for (const { name, gzipBytes } of sizes) {
    const kind = classify(name);
    if (kind === 'other') continue;
    found[kind] = true;
    const limit = limits[kind] * 1024;
    if (gzipBytes > limit) {
      const over = ((gzipBytes - limit) / 1024).toFixed(1);
      problems.push(`${name} is ${over} KB over its budget of ${limits[kind]} KB (gzip)`);
    }
  }
  if (!found.entry) problems.push('no entry chunk (index-*.js) was built');
  if (!found.game) problems.push('no game chunk (runtime-*.js) was built');
  return problems;
}
