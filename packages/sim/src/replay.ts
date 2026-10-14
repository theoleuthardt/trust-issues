import { INPUT_MASK_MAX } from './constants';

/** Longest run a single mask/count pair may describe. */
export const MAX_RUN_LENGTH = 65535;

export class ReplayError extends Error {}

/**
 * Run-length encodes one input mask per tick into a flat `[mask, count, mask, count, ...]` list.
 */
export function encodeReplay(inputs: readonly number[]): number[] {
  const encoded: number[] = [];
  let index = 0;
  while (index < inputs.length) {
    const mask = inputs[index] as number;
    let count = 1;
    while (
      index + count < inputs.length &&
      inputs[index + count] === mask &&
      count < MAX_RUN_LENGTH
    ) {
      count++;
    }
    encoded.push(mask, count);
    index += count;
  }
  return encoded;
}

/**
 * Expands a replay produced by `encodeReplay`. Every value is validated, because replays
 * come from untrusted clients; `maxFrames` bounds the expanded length.
 */
export function decodeReplay(encoded: readonly number[], maxFrames: number): number[] {
  if (encoded.length % 2 !== 0) throw new ReplayError('replay must contain mask/count pairs');

  const inputs: number[] = [];
  for (let i = 0; i < encoded.length; i += 2) {
    const mask = encoded[i] as number;
    const count = encoded[i + 1] as number;
    if (!Number.isInteger(mask) || mask < 0 || mask > INPUT_MASK_MAX) {
      throw new ReplayError(`invalid input mask ${mask}`);
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_RUN_LENGTH) {
      throw new ReplayError(`invalid run length ${count}`);
    }
    if (inputs.length + count > maxFrames) {
      throw new ReplayError(`replay exceeds ${maxFrames} frames`);
    }
    for (let n = 0; n < count; n++) inputs.push(mask);
  }
  return inputs;
}
