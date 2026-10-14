import { Input, encodeReplay } from './index';

const R = Input.Right;
const RJ = Input.Right | Input.Jump;

function replayOf(parts: readonly (readonly [number, number])[]): number[] {
  return encodeReplay(parts.flatMap(([mask, count]) => new Array<number>(count).fill(mask)));
}

export interface Solution {
  replay: number[];
  frames: number;
  deaths: number;
}

/** A known winning run per level id. Every level must have one so it is provably beatable. */
export const SOLUTIONS: Readonly<Record<string, Solution>> = {
  'trust-nothing': {
    replay: replayOf([
      [R, 62],
      [RJ, 1],
      [R, 84],
      [RJ, 1],
      [R, 200],
    ]),
    frames: 290,
    deaths: 0,
  },
};
