import { describe, expect, it } from 'vitest';
import { buildLevel } from './level';
import type { LevelDef } from './level';
import { previewStage } from './preview';

const def = (rows: string[], traps: LevelDef['stages'][number]['traps'] = []): LevelDef => ({
  id: 't',
  name: 't',
  stages: [{ rows, traps }],
  maxFrames: 3600,
  parFrames: 100,
});

const stageOf = (rows: string[], traps?: LevelDef['stages'][number]['traps']) => {
  const level = buildLevel(def(rows, traps));
  const stage = level.stages[0];
  if (!stage) throw new Error('no stage');
  return stage;
};

describe('previewStage', () => {
  it('draws the tiles with the spawn and the exit', () => {
    const text = previewStage(stageOf(['.....', '.S..E', '##^##']));

    expect(text.split('\n').slice(-3)).toEqual(['.....', '.S..E', '##^##']);
  });

  it('draws hidden, fake and fake exit tiles by their own characters', () => {
    const text = previewStage(stageOf(['.hf.X', '.S..E', '#####']));

    expect(text.split('\n').slice(-3)[0]).toBe('.hf.X');
  });

  it('marks the targets of traps with a number and the trigger with a letter', () => {
    const text = previewStage(
      stageOf(
        ['.....', '.S..E', '#####'],
        [
          {
            id: 'a',
            trigger: { x: 1, y: 0, width: 1, height: 2 },
            action: 'add_spikes',
            tiles: [[3, 1]],
          },
        ],
      ),
    );
    const lines = text.split('\n');

    expect(lines.some((line) => line.includes('1'))).toBe(true);
    expect(text).toContain('a: add_spikes at 3,1');
    expect(text).toContain('trigger 1,0 1x2');
  });

  it('lists delay and rearm of a trap when it has them', () => {
    const text = previewStage(
      stageOf(
        ['.....', '.S..E', '#####'],
        [
          {
            id: 'a',
            trigger: { x: 1, y: 0, width: 1, height: 2 },
            action: 'remove_tiles',
            tiles: [[3, 2]],
            delay: 30,
            rearm: 90,
          },
        ],
      ),
    );

    expect(text).toContain('delay 30');
    expect(text).toContain('rearm 90');
  });

  it('has a ruler of columns above the stage', () => {
    const text = previewStage(stageOf(['.........', '.S......E', '#########']));

    expect(text.split('\n')[0]).toBe('0123456789'.slice(0, 9));
  });

  it('lists the zones of a stage', () => {
    const level = buildLevel({
      ...def(['.......', '.S....E', '#######']),
      stages: [
        {
          rows: ['.......', '.S....E', '#######'],
          traps: [],
          zones: [{ x: 2, y: 0, width: 3, height: 2, effect: 'invert' }],
        },
      ],
    });
    const stage = level.stages[0];
    if (!stage) throw new Error('no stage');

    expect(previewStage(stage)).toContain('zone invert at 2,0 3x2');
  });

  it('lists the phase of a platform', () => {
    const level = buildLevel({
      ...def(['.......', '.S....E', '#######']),
      stages: [
        {
          rows: ['.......', '.S....E', '#######'],
          traps: [],
          platforms: [{ x: 2, y: 0, width: 2, axis: 'x', distance: 2, period: 40, phase: 10 }],
        },
      ],
    });
    const stage = level.stages[0];
    if (!stage) throw new Error('no stage');

    expect(previewStage(stage)).toContain('phase 10');
  });
});
