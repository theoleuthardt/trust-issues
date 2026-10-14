/**
 * Touch controls appear on coarse pointers (phones, tablets) and can be forced with
 * `?touch=1` or hidden with `?touch=0`.
 */
export function shouldShowTouchControls(search: string, coarsePointer: boolean): boolean {
  const override = new URLSearchParams(search).get('touch');
  if (override === '1') return true;
  if (override === '0') return false;
  return coarsePointer;
}
