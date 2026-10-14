import { describe, expect, it } from 'vitest';
import { LEG_LENGTH, advancePhase, figurePose, legFoot } from './figure';
import type { FigurePose } from './figure';

const standing = { vx: 0, vy: 0, onGround: true };
const walking = { vx: 3, vy: 0, onGround: true };
const rising = { vx: 0, vy: -6, onGround: false };
const falling = { vx: 0, vy: 6, onGround: false };

const spread = (pose: FigurePose) => Math.abs(pose.front.swing - pose.back.swing);

describe('advancePhase', () => {
  it('advances in proportion to the distance walked', () => {
    const slow = advancePhase(0, 1.5, true);
    const fast = advancePhase(0, 3, true);

    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeCloseTo(slow * 2);
  });

  it('advances the same way in both directions', () => {
    expect(advancePhase(0, -3, true)).toBeCloseTo(advancePhase(0, 3, true));
  });

  it('stands still when not moving or when airborne', () => {
    expect(advancePhase(1, 0, true)).toBe(1);
    expect(advancePhase(1, 3, false)).toBe(1);
  });

  it('wraps around after a full cycle', () => {
    let phase = 0;
    for (let i = 0; i < 1000; i++) phase = advancePhase(phase, 3, true);

    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(Math.PI * 2);
  });
});

describe('figurePose', () => {
  it('stands with both legs straight and no bob, regardless of the phase', () => {
    for (const phase of [0, 1, 2.5, 5]) {
      const pose = figurePose(standing, phase);

      expect(pose.front).toEqual({ swing: 0, lift: 0 });
      expect(pose.back).toEqual({ swing: 0, lift: 0 });
      expect(pose.bob).toBe(0);
    }
  });

  it('swings the legs in opposition while walking', () => {
    for (const phase of [0.3, 1, 2, 3.5, 5]) {
      const pose = figurePose(walking, phase);

      expect(pose.front.swing + pose.back.swing).toBeCloseTo(0);
    }
  });

  it('reaches the full swing at a quarter of the cycle', () => {
    const pose = figurePose(walking, Math.PI / 2);

    expect(pose.front.swing).toBeGreaterThan(0.4);
    expect(pose.back.swing).toBeLessThan(-0.4);
  });

  it('lifts a leg only while it swings forward, one leg at a time', () => {
    let lifted = 0;
    for (let phase = 0; phase < Math.PI * 2; phase += 0.1) {
      const { front, back } = figurePose(walking, phase);
      expect(front.lift).toBeGreaterThanOrEqual(0);
      expect(back.lift).toBeGreaterThanOrEqual(0);
      expect(Math.min(front.lift, back.lift)).toBe(0);
      lifted = Math.max(lifted, front.lift, back.lift);
    }

    expect(lifted).toBeGreaterThan(1);
  });

  it('never lifts a leg by more than its length', () => {
    for (const input of [standing, walking, rising, falling]) {
      for (let phase = 0; phase < Math.PI * 2; phase += 0.3) {
        const { front, back } = figurePose(input, phase);
        expect(front.lift).toBeLessThan(LEG_LENGTH);
        expect(back.lift).toBeLessThan(LEG_LENGTH);
      }
    }
  });

  it('bobs the body upwards only while walking', () => {
    for (let phase = 0; phase < Math.PI * 2; phase += 0.2) {
      expect(figurePose(walking, phase).bob).toBeLessThanOrEqual(0);
    }
    expect(figurePose(rising, 1).bob).toBe(0);
    expect(figurePose(falling, 1).bob).toBe(0);
  });

  it('tucks the legs when rising', () => {
    const pose = figurePose(rising, 0);

    expect(pose.front.lift).toBeGreaterThan(2);
    expect(pose.front.swing).toBeGreaterThan(0.5);
  });

  it('spreads the legs wide when falling', () => {
    const pose = figurePose(falling, 0);

    expect(pose.front.lift).toBe(0);
    expect(pose.back.lift).toBe(0);
    expect(spread(pose)).toBeGreaterThan(0.6);
  });
});

describe('legFoot', () => {
  const hip = { x: 10, y: 20 };

  it('hangs straight down by the leg length when standing', () => {
    const foot = legFoot(hip, { swing: 0, lift: 0 }, 1);

    expect(foot.x).toBeCloseTo(10);
    expect(foot.y - hip.y).toBeCloseTo(LEG_LENGTH);
  });

  it('puts the foot forward for a forward swing and mirrors with the facing', () => {
    const right = legFoot(hip, { swing: 0.6, lift: 0 }, 1);
    const left = legFoot(hip, { swing: 0.6, lift: 0 }, -1);

    expect(right.x).toBeGreaterThan(hip.x);
    expect(left.x - hip.x).toBeCloseTo(-(right.x - hip.x));
    expect(left.y).toBeCloseTo(right.y);
  });

  it('keeps the feet below the hips in every walking pose', () => {
    for (let phase = 0; phase < Math.PI * 2; phase += 0.1) {
      const pose = figurePose(walking, phase);
      for (const leg of [pose.front, pose.back]) {
        expect(legFoot(hip, leg, 1).y).toBeGreaterThanOrEqual(hip.y);
      }
    }
  });

  it('raises the foot by the lift', () => {
    const grounded = legFoot(hip, { swing: 0, lift: 0 }, 1);
    const lifted = legFoot(hip, { swing: 0, lift: 3 }, 1);

    expect(grounded.y - lifted.y).toBeCloseTo(3);
  });
});
