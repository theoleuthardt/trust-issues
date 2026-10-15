import { describe, expect, it, vi } from 'vitest';
import { fullscreenAvailable, isFullscreen, toggleFullscreen } from './fullscreen';
import type { FullscreenDocument } from './fullscreen';

function fakeDocument(overrides: Partial<FullscreenDocument> = {}) {
  const root = { requestFullscreen: vi.fn(() => Promise.resolve()) };
  const doc: FullscreenDocument = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: root,
    exitFullscreen: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  return { doc, root };
}

describe('fullscreenAvailable', () => {
  it('follows the browser', () => {
    expect(fullscreenAvailable(fakeDocument().doc)).toBe(true);
    expect(fullscreenAvailable(fakeDocument({ fullscreenEnabled: false }).doc)).toBe(false);
  });

  it('is false where the API does not exist, as on iPhones', () => {
    const { documentElement } = fakeDocument().doc;

    expect(fullscreenAvailable({ documentElement } as unknown as FullscreenDocument)).toBe(false);
  });
});

describe('toggleFullscreen', () => {
  it('enters fullscreen when the page is not in it', async () => {
    const { doc, root } = fakeDocument();

    await toggleFullscreen(doc);

    expect(root.requestFullscreen).toHaveBeenCalledOnce();
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it('leaves fullscreen when the page is in it', async () => {
    const { doc, root } = fakeDocument({ fullscreenElement: {} });

    await toggleFullscreen(doc);

    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(root.requestFullscreen).not.toHaveBeenCalled();
  });

  it('does nothing when it is not available', async () => {
    const { doc, root } = fakeDocument({ fullscreenEnabled: false });

    await toggleFullscreen(doc);

    expect(root.requestFullscreen).not.toHaveBeenCalled();
  });

  it('does not throw when the browser refuses', async () => {
    const { doc, root } = fakeDocument();
    root.requestFullscreen.mockRejectedValueOnce(new Error('denied'));

    await expect(toggleFullscreen(doc)).resolves.toBeUndefined();
  });
});

describe('isFullscreen', () => {
  it('reports whether an element is shown fullscreen', () => {
    expect(isFullscreen(fakeDocument().doc)).toBe(false);
    expect(isFullscreen(fakeDocument({ fullscreenElement: {} }).doc)).toBe(true);
  });
});
