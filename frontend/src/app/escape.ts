export type EscapeAction = 'pause' | 'resume' | 'close' | 'none';

/** What the Escape key does on the current screen; a held key must not toggle repeatedly. */
export function escapeAction(screen: string | undefined, repeat: boolean): EscapeAction {
  if (repeat) return 'none';
  if (screen === 'game') return 'pause';
  if (screen === 'pause') return 'resume';
  if (screen === 'replay') return 'close';
  return 'none';
}
