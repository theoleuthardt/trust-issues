import type { StorageLike } from './storage';

const KEY = 'trust-issues.ghost.v1';

/**
 * Whether the ghost of the own best run is shown while playing. It is off until the player
 * turns it on, and the choice survives a reload; without usable storage it lives in memory.
 */
export class GhostPreference {
  private memory: boolean | undefined;

  constructor(private readonly storage: StorageLike) {}

  enabled(): boolean {
    if (this.memory !== undefined) return this.memory;
    try {
      return this.storage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  }

  set(on: boolean): void {
    this.memory = on;
    try {
      this.storage.setItem(KEY, on ? 'on' : 'off');
      this.memory = undefined;
    } catch {
      return;
    }
  }
}
