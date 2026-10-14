import { buildLevel } from '../level';
import type { Level } from '../level';
import { LEVEL_CONTENT } from './content';
import pars from './pars.json';

/** All playable levels in play order. Par times come from `task levels:solve`. */
export const LEVELS: readonly Level[] = LEVEL_CONTENT.map((content) => {
  const parFrames = (pars as Record<string, number | undefined>)[content.id];
  if (parFrames === undefined) {
    throw new Error(`level ${content.id} has no par time, run "task levels:solve"`);
  }
  return buildLevel({ ...content, parFrames });
});

export function getLevel(id: string): Level | undefined {
  return LEVELS.find((level) => level.id === id);
}
