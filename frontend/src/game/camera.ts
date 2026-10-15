export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Where the top left of the view should be to have `player` in its middle, kept inside the world. */
export function cameraTarget(player: Point, view: Size, world: Size): Point {
  return {
    x: clamp(player.x - view.width / 2, 0, world.width - view.width),
    y: clamp(player.y - view.height / 2, 0, world.height - view.height),
  };
}

/** One step of easing the camera from where it is towards `target`; render only. */
export function followCamera(current: Point, target: Point, factor: number): Point {
  return {
    x: current.x + (target.x - current.x) * factor,
    y: current.y + (target.y - current.y) * factor,
  };
}
