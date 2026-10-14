import type { LevelContent } from '../level';
import { trustNothing } from './trust-nothing';

/** All level definitions in play order, without par times. */
export const LEVEL_CONTENT: readonly LevelContent[] = [trustNothing];
