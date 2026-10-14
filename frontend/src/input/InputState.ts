import { Input } from '@trust-issues/sim';

const KEY_BINDINGS: Readonly<Record<string, number>> = {
  ArrowLeft: Input.Left,
  KeyA: Input.Left,
  ArrowRight: Input.Right,
  KeyD: Input.Right,
  ArrowUp: Input.Jump,
  KeyW: Input.Jump,
  Space: Input.Jump,
};

/**
 * Single input path of the game: keyboard and touch both end up as one simulation input mask.
 */
export class InputState {
  private readonly heldKeys = new Set<string>();
  private touchMask = 0;

  setKey(code: string, down: boolean): void {
    if (!(code in KEY_BINDINGS)) return;
    if (down) this.heldKeys.add(code);
    else this.heldKeys.delete(code);
  }

  setTouch(bit: number, down: boolean): void {
    this.touchMask = down ? this.touchMask | bit : this.touchMask & ~bit;
  }

  mask(): number {
    let mask = this.touchMask;
    for (const code of this.heldKeys) mask |= KEY_BINDINGS[code] ?? 0;
    return mask;
  }

  reset(): void {
    this.heldKeys.clear();
    this.touchMask = 0;
  }

  /** Whether the key code is one the game reacts to, so callers can suppress page scrolling. */
  static isBound(code: string): boolean {
    return code in KEY_BINDINGS;
  }
}
