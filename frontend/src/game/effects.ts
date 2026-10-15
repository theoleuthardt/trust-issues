/** Duration of the pop-in of a spike that a trap revealed. */
export const POP_MS = 180;
/** Duration of the shrinking of a tile that a trap removed. */
export const VANISH_MS = 220;
/** Lifetime of a death particle. */
export const PARTICLE_LIFE_MS = 450;
/** Camera shake on a death; `intensity` is a fraction of the view size. */
export const DEATH_SHAKE = { durationMs: 140, intensity: 0.006 } as const;

const OVERSHOOT = 1.70158;
const GRAVITY_PX_PER_S2 = 600;
const BASE_SPEED_PX_PER_S = 110;

export interface TileChange {
  index: number;
  from: number;
  to: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Tiles whose kind differs between two grids of the same size. */
export function tileChanges(previous: Uint8Array, next: Uint8Array): TileChange[] {
  if (previous.length !== next.length) return [];
  const changes: TileChange[] = [];
  for (let index = 0; index < next.length; index++) {
    const from = previous[index] ?? 0;
    const to = next[index] ?? 0;
    if (from !== to) changes.push({ index, from, to });
  }
  return changes;
}

/** Scale of a revealed spike: 0 to 1 with a small overshoot, 0 before it starts. */
export function popScale(ageMs: number): number {
  if (ageMs <= 0) return 0;
  if (ageMs >= POP_MS) return 1;
  const offset = ageMs / POP_MS - 1;
  return 1 + (OVERSHOOT + 1) * offset ** 3 + OVERSHOOT * offset ** 2;
}

/** Scale of a removed tile: 1 down to 0. */
export function vanishScale(ageMs: number): number {
  if (ageMs <= 0) return 1;
  if (ageMs >= VANISH_MS) return 0;
  return (1 - ageMs / VANISH_MS) ** 2;
}

/** A fan of particles thrown upwards from the origin, the same for the same arguments. */
export function burst(origin: { x: number; y: number }, count: number): Particle[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = count === 1 ? -Math.PI / 2 : -Math.PI + (index * Math.PI) / (count - 1);
    const speed = BASE_SPEED_PX_PER_S + (index % 3) * 35;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  });
}

/** Position and opacity of a particle at an age, or undefined once it is gone. */
export function particleAt(
  particle: Particle,
  ageMs: number,
): { x: number; y: number; alpha: number } | undefined {
  if (ageMs >= PARTICLE_LIFE_MS) return undefined;
  const seconds = ageMs / 1000;
  return {
    x: particle.x + particle.vx * seconds,
    y: particle.y + particle.vy * seconds + 0.5 * GRAVITY_PX_PER_S2 * seconds * seconds,
    alpha: 1 - ageMs / PARTICLE_LIFE_MS,
  };
}
