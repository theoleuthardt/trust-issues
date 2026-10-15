import { formatTime } from '../format';

/** The sentence a screen reader gets when a level is cleared. */
export function finishAnnouncement(
  title: string,
  run: { frames: number; deaths: number; score: number },
): string {
  const deaths = `${run.deaths} ${run.deaths === 1 ? 'death' : 'deaths'}`;
  return `Level ${title} cleared in ${formatTime(run.frames)} with ${deaths}, ${run.score} points.`;
}

/** The sentence for a new stage; `index` counts from zero. */
export function stageAnnouncement(index: number, total: number): string {
  return `Stage ${index + 1} of ${total}.`;
}
