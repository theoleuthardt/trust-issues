import solutions from './solutions.json' with { type: 'json' };

export * from './solver';

export interface Solution {
  replay: number[];
  frames: number;
  deaths: number;
}

/** A recorded zero-death winning run per level id, written by `task levels:solve`. */
export const SOLUTIONS: Readonly<Record<string, Solution | undefined>> = solutions;
