import { describe, expect, it } from 'vitest';
import { cameraTarget, followCamera } from './camera';

const VIEW = { width: 1024, height: 576 };

describe('cameraTarget', () => {
  it('centres the view on the player in a large world', () => {
    const target = cameraTarget({ x: 2000, y: 600 }, VIEW, { width: 4096, height: 1536 });

    expect(target).toEqual({ x: 2000 - 512, y: 600 - 288 });
  });

  it('stops at the left and top edge of the world', () => {
    expect(cameraTarget({ x: 100, y: 50 }, VIEW, { width: 4096, height: 1536 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('stops at the right and bottom edge of the world', () => {
    expect(cameraTarget({ x: 4000, y: 1500 }, VIEW, { width: 4096, height: 1536 })).toEqual({
      x: 4096 - 1024,
      y: 1536 - 576,
    });
  });

  it('does not move at all in a world that is as big as the view', () => {
    expect(cameraTarget({ x: 900, y: 500 }, VIEW, VIEW)).toEqual({ x: 0, y: 0 });
  });

  it('stays at the origin in a world that is smaller than the view', () => {
    expect(cameraTarget({ x: 100, y: 100 }, VIEW, { width: 500, height: 300 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('followCamera', () => {
  it('moves a fraction of the way to the target', () => {
    expect(followCamera({ x: 0, y: 0 }, { x: 100, y: -50 }, 0.25)).toEqual({ x: 25, y: -12.5 });
  });

  it('arrives at the target and does not overshoot', () => {
    let position = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) position = followCamera(position, { x: 300, y: 80 }, 0.2);

    expect(position.x).toBeCloseTo(300, 3);
    expect(position.y).toBeCloseTo(80, 3);
  });

  it('jumps straight to the target with a factor of 1', () => {
    expect(followCamera({ x: 5, y: 5 }, { x: 70, y: 9 }, 1)).toEqual({ x: 70, y: 9 });
  });
});
