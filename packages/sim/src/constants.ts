/** Edge length of one level tile in simulation units (pixels). */
export const TILE_SIZE = 32;

/** The simulation advances in fixed ticks; one replay entry is one tick. */
export const TICKS_PER_SECOND = 60;

export const PLAYER_WIDTH = 24;
export const PLAYER_HEIGHT = 28;

/** Downward acceleration per tick. */
export const GRAVITY = 0.5;
export const MAX_FALL_SPEED = 12;
export const MOVE_SPEED = 3;
export const JUMP_VELOCITY = -9.5;

/** Spike hitboxes are the tile shrunk by this many units on every side. */
export const SPIKE_INSET = 6;

/** Bit set describing which controls are held during one tick. */
export const Input = { Left: 1, Right: 2, Jump: 4 } as const;
export const INPUT_MASK_MAX = Input.Left | Input.Right | Input.Jump;

export const Tile = { Air: 0, Solid: 1, Spike: 2 } as const;
