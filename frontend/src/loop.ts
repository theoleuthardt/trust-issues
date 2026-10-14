const ROUNDING_TOLERANCE = 1e-6;

/**
 * Converts variable frame deltas into whole simulation ticks. Rendering speed never changes
 * the simulation: one tick is always one replay entry. After a long stall the backlog is
 * dropped instead of replayed, so the game slows down rather than freezing.
 */
export class FixedStepper {
  private accumulated = 0;

  constructor(
    private readonly tickMs: number,
    private readonly maxTicksPerFrame: number,
  ) {}

  advance(deltaMs: number): number {
    this.accumulated += Math.max(0, deltaMs);
    const ticks = Math.floor(this.accumulated / this.tickMs + ROUNDING_TOLERANCE);
    if (ticks > this.maxTicksPerFrame) {
      this.accumulated = 0;
      return this.maxTicksPerFrame;
    }
    this.accumulated = Math.max(0, this.accumulated - ticks * this.tickMs);
    return ticks;
  }

  reset(): void {
    this.accumulated = 0;
  }
}
