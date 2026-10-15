import { describe, expect, it } from 'vitest';
import { SOUNDS, outputGain, totalDuration } from './effects';
import type { SoundName } from './effects';

const NAMES: SoundName[] = ['jump', 'death', 'trap', 'exit'];

describe('SOUNDS', () => {
  it('has the four effects of the game', () => {
    expect(Object.keys(SOUNDS).sort()).toEqual([...NAMES].sort());
  });

  it.each(NAMES)('%s is short and made of audible tones', (name) => {
    const tones = SOUNDS[name];

    expect(tones.length).toBeGreaterThan(0);
    expect(totalDuration(tones)).toBeLessThanOrEqual(0.6);
    for (const tone of tones) {
      expect(tone.from).toBeGreaterThanOrEqual(40);
      expect(tone.to).toBeGreaterThanOrEqual(40);
      expect(tone.from).toBeLessThanOrEqual(4000);
      expect(tone.duration).toBeGreaterThan(0);
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(1);
      expect(tone.start).toBeGreaterThanOrEqual(0);
    }
  });

  it('lets the jump rise and the death fall', () => {
    const jump = SOUNDS.jump[0];
    const death = SOUNDS.death[0];

    expect(jump && jump.to > jump.from).toBe(true);
    expect(death && death.to < death.from).toBe(true);
  });
});

describe('totalDuration', () => {
  it('is the end of the last tone', () => {
    expect(
      totalDuration([
        { type: 'sine', from: 100, to: 100, start: 0, duration: 0.1, gain: 1 },
        { type: 'sine', from: 100, to: 100, start: 0.1, duration: 0.2, gain: 1 },
      ]),
    ).toBeCloseTo(0.3, 5);
  });

  it('is 0 without tones', () => {
    expect(totalDuration([])).toBe(0);
  });
});

describe('outputGain', () => {
  it('is silent when muted, whatever the volume', () => {
    expect(outputGain({ muted: true, volume: 100 })).toBe(0);
  });

  it('is silent at volume 0', () => {
    expect(outputGain({ muted: false, volume: 0 })).toBe(0);
  });

  it('grows with the volume and stays below 1', () => {
    const quiet = outputGain({ muted: false, volume: 20 });
    const loud = outputGain({ muted: false, volume: 100 });

    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it('clamps a volume outside 0 to 100', () => {
    expect(outputGain({ muted: false, volume: 500 })).toBe(
      outputGain({ muted: false, volume: 100 }),
    );
    expect(outputGain({ muted: false, volume: -5 })).toBe(0);
  });
});
