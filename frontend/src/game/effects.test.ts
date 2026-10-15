import { describe, expect, it } from 'vitest';
import {
  DEATH_SHAKE,
  POP_MS,
  VANISH_MS,
  PARTICLE_LIFE_MS,
  burst,
  particleAt,
  popScale,
  tileChanges,
  vanishScale,
} from './effects';

describe('tileChanges', () => {
  it('reports nothing when the grids are equal', () => {
    const grid = new Uint8Array([0, 1, 2, 0]);

    expect(tileChanges(grid, grid.slice())).toEqual([]);
  });

  it('reports every changed tile with its old and new kind', () => {
    const before = new Uint8Array([0, 1, 1, 0]);
    const after = new Uint8Array([2, 1, 0, 0]);

    expect(tileChanges(before, after)).toEqual([
      { index: 0, from: 0, to: 2 },
      { index: 2, from: 1, to: 0 },
    ]);
  });

  it('treats grids of different length as unrelated and reports nothing', () => {
    expect(tileChanges(new Uint8Array(3), new Uint8Array(4))).toEqual([]);
  });
});

describe('popScale', () => {
  it('starts at zero and settles at one', () => {
    expect(popScale(0)).toBe(0);
    expect(popScale(POP_MS)).toBe(1);
    expect(popScale(POP_MS * 3)).toBe(1);
  });

  it('overshoots a little before settling', () => {
    let peak = 0;
    for (let t = 0; t <= POP_MS; t += 5) peak = Math.max(peak, popScale(t));

    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.3);
  });

  it('is zero for negative ages', () => {
    expect(popScale(-10)).toBe(0);
  });
});

describe('vanishScale', () => {
  it('shrinks from one to zero', () => {
    expect(vanishScale(0)).toBe(1);
    expect(vanishScale(VANISH_MS)).toBe(0);
    expect(vanishScale(VANISH_MS * 2)).toBe(0);
  });

  it('never grows', () => {
    let previous = 1;
    for (let t = 0; t <= VANISH_MS; t += 10) {
      const scale = vanishScale(t);
      expect(scale).toBeLessThanOrEqual(previous);
      previous = scale;
    }
  });
});

describe('burst', () => {
  it('creates the requested number of particles at the origin', () => {
    const particles = burst({ x: 10, y: 20 }, 8);

    expect(particles).toHaveLength(8);
    for (const particle of particles) {
      expect(particle.x).toBe(10);
      expect(particle.y).toBe(20);
    }
  });

  it('spreads the particles in different directions', () => {
    const particles = burst({ x: 0, y: 0 }, 8);
    const directions = new Set(particles.map((p) => `${p.vx.toFixed(2)},${p.vy.toFixed(2)}`));

    expect(directions.size).toBe(8);
  });

  it('is deterministic', () => {
    expect(burst({ x: 1, y: 2 }, 6)).toEqual(burst({ x: 1, y: 2 }, 6));
  });
});

describe('particleAt', () => {
  const [particle] = burst({ x: 0, y: 0 }, 1);

  it('starts at the origin fully visible', () => {
    const at = particleAt(particle as NonNullable<typeof particle>, 0);

    expect(at).toEqual({ x: 0, y: 0, alpha: 1 });
  });

  it('moves away and fades out', () => {
    const early = particleAt(particle as NonNullable<typeof particle>, 50);
    const late = particleAt(particle as NonNullable<typeof particle>, PARTICLE_LIFE_MS - 50);

    expect(early).toBeDefined();
    expect(late).toBeDefined();
    expect((late?.alpha ?? 1) < (early?.alpha ?? 0)).toBe(true);
  });

  it('is gone after its lifetime', () => {
    expect(particleAt(particle as NonNullable<typeof particle>, PARTICLE_LIFE_MS)).toBeUndefined();
  });

  it('falls under gravity', () => {
    const resting = { x: 0, y: 0, vx: 0, vy: 0 };

    const at = particleAt(resting, 300);

    expect(at?.y ?? 0).toBeGreaterThan(0);
  });
});

describe('DEATH_SHAKE', () => {
  it('is short and gentle so that a death never gets in the way of the next try', () => {
    expect(DEATH_SHAKE.durationMs).toBeGreaterThan(0);
    expect(DEATH_SHAKE.durationMs).toBeLessThanOrEqual(200);
    expect(DEATH_SHAKE.intensity).toBeGreaterThan(0);
    expect(DEATH_SHAKE.intensity).toBeLessThanOrEqual(0.01);
  });

  it('ends before the death particles do', () => {
    expect(DEATH_SHAKE.durationMs).toBeLessThan(PARTICLE_LIFE_MS);
  });
});
