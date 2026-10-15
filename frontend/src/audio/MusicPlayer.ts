import { MusicScheduler, TRACKS, midiToHz, musicGain } from './music';
import type { AudioLike } from './SoundBoard';
import type { MusicSettings, TrackName } from './music';

const LOOKAHEAD_SECONDS = 1;
const CROSSFADE_SECONDS = 1.2;
const DUCK_LEVEL = 0.25;
const DUCK_IN_SECONDS = 0.05;
const DUCK_OUT_SECONDS = 0.7;
const TRACK_NAMES: readonly TrackName[] = ['menu', 'game'];

type Gain = ReturnType<AudioLike['createGain']>;

/**
 * Loops one of two generated tracks, cross-fading when the track changes and ducking for a
 * moment on a death. `tick` has to be called regularly (about every 200 ms) to schedule the
 * notes of the next second; nothing plays until the audio context exists and a track is set.
 */
export class MusicPlayer {
  private context: AudioLike | undefined;
  private master: Gain | undefined;
  private buses: Partial<Record<TrackName, Gain>> = {};
  private schedulers: Partial<Record<TrackName, MusicScheduler>> = {};
  private wanted: TrackName | undefined;
  private active: TrackName | undefined;
  private appliedLevel = -1;
  private duckedUntil = 0;

  constructor(
    private readonly contextProvider: () => AudioLike | undefined,
    private readonly settings: () => MusicSettings,
  ) {}

  /** Chooses the track to play; the previous one fades out while the new one fades in. */
  setTrack(track: TrackName): void {
    this.wanted = track;
    const context = this.ready();
    if (!context || this.active === track) return;
    const now = context.currentTime;
    for (const name of TRACK_NAMES) {
      const bus = this.buses[name];
      if (!bus) continue;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(name === this.active ? 1 : 0, now);
      bus.gain.linearRampToValueAtTime(name === track ? 1 : 0, now + CROSSFADE_SECONDS);
    }
    this.schedulers[track] = new MusicScheduler(TRACKS[track], now + 0.05);
    this.active = track;
  }

  /** A short dip of the music, for example when the player dies. */
  duck(): void {
    const context = this.ready();
    if (!context || !this.master) return;
    const level = musicGain(this.settings());
    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(level * DUCK_LEVEL, now + DUCK_IN_SECONDS);
    this.master.gain.linearRampToValueAtTime(level, now + DUCK_IN_SECONDS + DUCK_OUT_SECONDS);
    this.appliedLevel = level;
    this.duckedUntil = now + DUCK_IN_SECONDS + DUCK_OUT_SECONDS;
  }

  /** Applies the current settings and schedules the notes that start in the next second. */
  tick(): void {
    const context = this.ready();
    if (!context || !this.master) return;
    const level = musicGain(this.settings());
    if (level !== this.appliedLevel && context.currentTime >= this.duckedUntil) {
      this.master.gain.setValueAtTime(level, context.currentTime);
      this.appliedLevel = level;
    }
    if (level <= 0) return;

    if (this.wanted && this.active !== this.wanted) this.setTrack(this.wanted);
    const track = this.active;
    const bus = track ? this.buses[track] : undefined;
    const scheduler = track ? this.schedulers[track] : undefined;
    if (!track || !bus || !scheduler) return;

    const definition = TRACKS[track];
    scheduler.skipUntil(context.currentTime);
    for (const { time, note } of scheduler.drain(context.currentTime + LOOKAHEAD_SECONDS)) {
      const gain = context.createGain();
      const end = time + note.length * definition.beatSeconds;
      gain.gain.setValueAtTime(note.gain, time);
      gain.gain.linearRampToValueAtTime(0.0001, end);
      gain.connect(bus);
      const oscillator = context.createOscillator();
      oscillator.type = definition.type;
      oscillator.frequency.setValueAtTime(midiToHz(note.midi), time);
      oscillator.connect(gain);
      oscillator.start(time);
      oscillator.stop(end + 0.02);
    }
  }

  private ready(): AudioLike | undefined {
    this.context ??= this.contextProvider();
    const context = this.context;
    if (!context) return undefined;
    if (!this.master) {
      this.master = context.createGain();
      this.master.gain.setValueAtTime(musicGain(this.settings()), context.currentTime);
      this.master.connect(context.destination);
      for (const name of TRACK_NAMES) {
        const bus = context.createGain();
        bus.gain.setValueAtTime(0, context.currentTime);
        bus.connect(this.master);
        this.buses[name] = bus;
      }
    }
    return context;
  }
}
