/** The part of `document` the fullscreen toggle uses, so tests can stand in for it. */
export interface FullscreenDocument {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: unknown;
  readonly documentElement: { requestFullscreen(): Promise<void> };
  exitFullscreen(): Promise<void>;
}

/** Whether the browser lets the page go fullscreen; iPhones do not. */
export function fullscreenAvailable(doc: FullscreenDocument): boolean {
  return doc.fullscreenEnabled === true;
}

export function isFullscreen(doc: FullscreenDocument): boolean {
  return doc.fullscreenElement !== null && doc.fullscreenElement !== undefined;
}

/** Enters or leaves fullscreen; a browser that refuses is not an error. */
export async function toggleFullscreen(doc: FullscreenDocument): Promise<void> {
  if (!fullscreenAvailable(doc)) return;
  try {
    if (isFullscreen(doc)) await doc.exitFullscreen();
    else await doc.documentElement.requestFullscreen();
  } catch {
    return;
  }
}
