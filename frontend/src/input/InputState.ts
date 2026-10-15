import { DEFAULT_SETTINGS, bindingsOf } from '../app/settings';

type Bindings = Readonly<Record<string, number>>;

/**
 * Single input path of the game: keyboard and touch both end up as one simulation input mask.
 * The key bindings can be replaced at any time.
 */
export class InputState {
  private readonly heldKeys = new Set<string>();
  private touchMask = 0;

  constructor(private bindings: Bindings = bindingsOf(DEFAULT_SETTINGS.keys)) {}

  /** Replaces the key bindings; keys that are held but no longer bound are let go. */
  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
    for (const code of this.heldKeys) {
      if (!(code in bindings)) this.heldKeys.delete(code);
    }
  }

  setKey(code: string, down: boolean): void {
    if (!(code in this.bindings)) return;
    if (down) this.heldKeys.add(code);
    else this.heldKeys.delete(code);
  }

  setTouch(bit: number, down: boolean): void {
    this.touchMask = down ? this.touchMask | bit : this.touchMask & ~bit;
  }

  mask(): number {
    let mask = this.touchMask;
    for (const code of this.heldKeys) mask |= this.bindings[code] ?? 0;
    return mask;
  }

  reset(): void {
    this.heldKeys.clear();
    this.touchMask = 0;
  }

  /** Whether the key code is one the game reacts to, so callers can suppress page scrolling. */
  isBound(code: string): boolean {
    return code in this.bindings;
  }
}
