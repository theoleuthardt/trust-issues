export type StageDot = 'done' | 'current' | 'todo';

/** One dot per stage for the progress row of the HUD. */
export function stageDots(current: number, total: number): StageDot[] {
  return Array.from({ length: total }, (_, index) => {
    if (index < current) return 'done';
    return index === current ? 'current' : 'todo';
  });
}

/** The level that follows `currentId` in play order, if there is one. */
export function nextLevel<T extends { id: string }>(
  levels: readonly T[],
  currentId: string,
): T | undefined {
  const index = levels.findIndex((level) => level.id === currentId);
  return index === -1 ? undefined : levels[index + 1];
}

/** Index of the level named by `?level=<id>`, the first level otherwise. */
export function startIndex(levels: readonly { id: string }[], search: string): number {
  const id = new URLSearchParams(search).get('level');
  const index = levels.findIndex((level) => level.id === id);
  return index === -1 ? 0 : index;
}
