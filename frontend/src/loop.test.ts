import { describe, expect, it } from 'vitest';
import { FixedStepper } from './loop';

describe('FixedStepper', () => {
  it('returns no ticks until a full tick of time has accumulated', () => {
    const stepper = new FixedStepper(1000 / 60, 5);

    expect(stepper.advance(10)).toBe(0);
    expect(stepper.advance(10)).toBe(1);
  });

  it('carries the remainder over to the next frame', () => {
    const stepper = new FixedStepper(10, 5);

    expect(stepper.advance(25)).toBe(2);
    expect(stepper.advance(5)).toBe(1);
  });

  it('runs several ticks for a long frame', () => {
    const stepper = new FixedStepper(10, 5);

    expect(stepper.advance(40)).toBe(4);
  });

  it('caps ticks per frame and drops the backlog', () => {
    const stepper = new FixedStepper(10, 5);

    expect(stepper.advance(1000)).toBe(5);
    expect(stepper.advance(0)).toBe(0);
  });

  it('ignores negative deltas', () => {
    const stepper = new FixedStepper(10, 5);

    expect(stepper.advance(-50)).toBe(0);
  });

  it('forgets accumulated time on reset', () => {
    const stepper = new FixedStepper(10, 5);
    stepper.advance(9);

    stepper.reset();

    expect(stepper.advance(1)).toBe(0);
  });
});
