/** Length in pixels of a straight, standing leg. */
export const LEG_LENGTH = 8;

const PHASE_PER_PIXEL = 0.11;
const MAX_SWING = 0.55;
const WALK_LIFT = 3;
const BOB = 1;
const FULL_CYCLE = Math.PI * 2;

export interface FigureInput {
  vx: number;
  vy: number;
  onGround: boolean;
}

/** One leg: `swing` is the angle from vertical in radians (positive is forward), `lift` shortens it in pixels. */
export interface LegPose {
  swing: number;
  lift: number;
}

export interface FigurePose {
  front: LegPose;
  back: LegPose;
  bob: number;
}

/**
 * Advances the walk cycle in proportion to the distance covered. The phase is render-only
 * state and never feeds back into the simulation.
 */
export function advancePhase(phase: number, vx: number, onGround: boolean): number {
  if (!onGround || vx === 0) return phase;
  return (phase + Math.abs(vx) * PHASE_PER_PIXEL) % FULL_CYCLE;
}

/** Leg and body pose of the faceless figure for the current movement and walk phase. */
export function figurePose(input: FigureInput, phase: number): FigurePose {
  if (!input.onGround) {
    return input.vy < 0
      ? {
          front: { swing: 0.7, lift: 4 },
          back: { swing: -0.3, lift: 2 },
          bob: 0,
        }
      : {
          front: { swing: 0.5, lift: 0 },
          back: { swing: -0.5, lift: 0 },
          bob: 0,
        };
  }
  if (input.vx === 0) {
    return { front: { swing: 0, lift: 0 }, back: { swing: 0, lift: 0 }, bob: 0 };
  }

  const swing = MAX_SWING * Math.sin(phase);
  const forward = Math.cos(phase);
  return {
    front: { swing, lift: WALK_LIFT * Math.max(0, forward) },
    back: { swing: -swing, lift: WALK_LIFT * Math.max(0, -forward) },
    bob: -BOB * Math.abs(forward),
  };
}

/** Where the foot of a leg ends up for a hip position; `facing` is 1 for right and -1 for left. */
export function legFoot(
  hip: { x: number; y: number },
  leg: LegPose,
  facing: 1 | -1,
): { x: number; y: number } {
  const length = LEG_LENGTH - leg.lift;
  return {
    x: hip.x + facing * Math.sin(leg.swing) * length,
    y: hip.y + Math.cos(leg.swing) * length,
  };
}
