import { Tile } from './constants';
import type { Stage } from './level';

const CHARS: Record<number, string> = {
  [Tile.Air]: '.',
  [Tile.Solid]: '#',
  [Tile.Spike]: '^',
  [Tile.Hidden]: 'h',
  [Tile.Fake]: 'f',
  [Tile.FakeExit]: 'X',
};

/**
 * A plain-text picture of a stage for authors: a column ruler, the tiles with `S` and `E`, a
 * digit on the tile a trap changes (when that tile is air) and a list of the traps below.
 */
export function previewStage(stage: Stage): string {
  const grid: string[][] = [];
  for (let y = 0; y < stage.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < stage.width; x++) {
      row.push(CHARS[stage.tiles[y * stage.width + x] ?? Tile.Air] ?? '?');
    }
    grid.push(row);
  }

  const spawnX = Math.floor((stage.spawn.x + 1) / 32);
  const spawnY = Math.floor(stage.spawn.y / 32);
  const spawnRow = grid[spawnY];
  if (spawnRow) spawnRow[spawnX] = 'S';
  const exitRow = grid[stage.exit.y];
  if (exitRow) exitRow[stage.exit.x] = 'E';

  stage.traps.forEach((trap, index) => {
    const mark = String((index + 1) % 10);
    for (const [x, y] of trap.tiles) {
      const row = grid[y];
      if (row && row[x] === '.') row[x] = mark;
    }
  });

  const ruler = Array.from({ length: stage.width }, (_, x) => String(x % 10)).join('');
  const traps = stage.traps.map((trap, index) => {
    const timing = [
      trap.delay !== undefined ? `delay ${trap.delay}` : '',
      trap.rearm !== undefined ? `rearm ${trap.rearm}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const targets = trap.tiles.map(([x, y]) => `${x},${y}`).join(' ');
    const { x, y, width, height } = trap.trigger;
    return `${(index + 1) % 10} ${trap.id}: ${trap.action} at ${targets} (trigger ${x},${y} ${width}x${height}${timing ? `, ${timing}` : ''})`;
  });

  const zones = stage.zones.map(
    (zone) => `zone ${zone.effect} at ${zone.x},${zone.y} ${zone.width}x${zone.height}`,
  );

  const platforms = stage.platforms.map(
    (platform) =>
      `platform at ${platform.x},${platform.y} width ${platform.width} moves ${platform.distance} along ${platform.axis} every ${platform.period} ticks${platform.phase ? `, phase ${platform.phase}` : ''}`,
  );

  return [ruler, ...grid.map((row) => row.join('')), ...traps, ...zones, ...platforms].join('\n');
}
