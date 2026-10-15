import type { LevelContent } from '../level';
import { PACK_1 } from './pack-1';
import { PACK_2 } from './pack-2';
import { PACK_3 } from './pack-3';
import { PACK_4 } from './pack-4';
import { PACK_5 } from './pack-5';

/** All level definitions in play order, without par times. */
export const LEVEL_CONTENT: readonly LevelContent[] = [
  ...PACK_1,
  ...PACK_2,
  ...PACK_3,
  ...PACK_4,
  ...PACK_5,
];
