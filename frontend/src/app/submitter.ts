import { ApiError } from '../api/client';
import type { RunResult } from '../api/client';
import { submissionText } from './submission';

export interface FinishedRun {
  levelId: string;
  replay: number[];
}

export interface SubmitterDeps {
  signedIn: () => boolean;
  submit: (levelId: string, replay: number[]) => Promise<RunResult>;
  signOut: () => void;
  setStatus: (text: string) => void;
}

/**
 * Sends finished runs to the server and reports what happened on the finish screen. Only the
 * newest run may change the status, a failed run can be sent again, and a rejected session
 * signs the player out.
 */
export class RunSubmitter {
  private sequence = 0;
  private failed: FinishedRun | undefined;

  constructor(private readonly deps: SubmitterDeps) {}

  async send(run: FinishedRun): Promise<void> {
    const mine = ++this.sequence;
    this.failed = undefined;
    if (!this.deps.signedIn()) {
      this.deps.setStatus('Sign in to put your runs on the leaderboard.');
      return;
    }
    this.deps.setStatus('Sending the run…');
    try {
      const result = await this.deps.submit(run.levelId, run.replay);
      if (mine === this.sequence) this.deps.setStatus(submissionText(result));
    } catch (error) {
      if (mine !== this.sequence) return;
      const message = error instanceof ApiError ? error.message : 'Something went wrong.';
      if (error instanceof ApiError && error.status === 401) {
        this.deps.signOut();
        this.deps.setStatus(message);
        return;
      }
      this.failed = run;
      this.deps.setStatus(`${message} Press S to try again.`);
    }
  }

  /** Sends the last run again, but only if its sending failed. */
  retry(): void {
    if (this.failed) void this.send(this.failed);
  }
}
