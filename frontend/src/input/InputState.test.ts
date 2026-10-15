import { describe, expect, it } from 'vitest';
import { Input } from '@trust-issues/sim';
import { InputState } from './InputState';

describe('InputState', () => {
  it('starts with nothing pressed', () => {
    expect(new InputState().mask()).toBe(0);
  });

  it('maps arrow keys and WASD to the same controls', () => {
    const input = new InputState();

    input.setKey('ArrowLeft', true);
    expect(input.mask()).toBe(Input.Left);
    input.setKey('ArrowLeft', false);

    input.setKey('KeyD', true);
    expect(input.mask()).toBe(Input.Right);
  });

  it('maps space, up and W to jump', () => {
    for (const code of ['Space', 'ArrowUp', 'KeyW']) {
      const input = new InputState();
      input.setKey(code, true);
      expect(input.mask()).toBe(Input.Jump);
    }
  });

  it('combines held controls', () => {
    const input = new InputState();

    input.setKey('ArrowRight', true);
    input.setKey('Space', true);

    expect(input.mask()).toBe(Input.Right | Input.Jump);
  });

  it('keeps a control held while another key bound to it is still down', () => {
    const input = new InputState();

    input.setKey('Space', true);
    input.setKey('ArrowUp', true);
    input.setKey('Space', false);

    expect(input.mask()).toBe(Input.Jump);
  });

  it('ignores unbound keys', () => {
    const input = new InputState();

    input.setKey('KeyQ', true);

    expect(input.mask()).toBe(0);
  });

  it('combines touch and keyboard controls', () => {
    const input = new InputState();

    input.setKey('ArrowLeft', true);
    input.setTouch(Input.Jump, true);
    expect(input.mask()).toBe(Input.Left | Input.Jump);

    input.setTouch(Input.Jump, false);
    expect(input.mask()).toBe(Input.Left);
  });

  it('releases everything on reset', () => {
    const input = new InputState();
    input.setKey('ArrowRight', true);
    input.setTouch(Input.Jump, true);

    input.reset();

    expect(input.mask()).toBe(0);
  });

  it('uses the keys of the given bindings instead of the default ones', () => {
    const input = new InputState({ KeyJ: Input.Left, KeyK: Input.Jump });

    input.setKey('KeyJ', true);
    input.setKey('ArrowLeft', true);

    expect(input.mask()).toBe(Input.Left);
    expect(input.isBound('KeyK')).toBe(true);
    expect(input.isBound('ArrowLeft')).toBe(false);
  });

  it('applies new bindings at once and lets go of keys that are no longer bound', () => {
    const input = new InputState();
    input.setKey('ArrowLeft', true);

    input.setBindings({ KeyJ: Input.Left });

    expect(input.mask()).toBe(0);
    input.setKey('KeyJ', true);
    expect(input.mask()).toBe(Input.Left);
  });

  it('knows the default keys', () => {
    const input = new InputState();

    expect(input.isBound('Space')).toBe(true);
    expect(input.isBound('KeyQ')).toBe(false);
  });
});
