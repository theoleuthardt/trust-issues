import { buildLevel } from '../level';
import type { Level } from '../level';
import { trustNothing } from './trust-nothing';

/** All playable levels in play order. */
export const LEVELS: readonly Level[] = [buildLevel(trustNothing)];

export function getLevel(id: string): Level | undefined {
  return LEVELS.find((level) => level.id === id);
}
