import Phaser from 'phaser';
import {
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TICKS_PER_SECOND,
  TILE_SIZE,
  Tile,
  createState,
  encodeReplay,
  platformRect,
  runVersions,
  scoreRun,
  stageOf,
  step,
} from '@trust-issues/sim';
import type { GameState, Level, RunVersions, Stage } from '@trust-issues/sim';
import { Input } from '@trust-issues/sim';
import type { SoundName } from '../audio/effects';
import { formatTime } from '../format';
import { ReplayCursor, SPEEDS } from '../app/replayPlayback';
import type { InputState } from '../input/InputState';
import { FixedStepper } from '../loop';
import {
  DEATH_SHAKE,
  POP_MS,
  VANISH_MS,
  burst,
  particleAt,
  popScale,
  tileChanges,
  vanishScale,
} from './effects';
import type { Particle } from './effects';
import { appearanceOf } from './appearance';
import { advancePhase, facingAfter, figurePose, legFoot } from './figure';
import { nextLevel, stageDots } from './progress';
import { PALETTE, colorNumber } from '../theme';

export const SCENE_KEY = 'game';

/** Emitted on the scene's event emitter when the player reaches the exit. */
export const RUN_FINISHED = 'run-finished';

export interface RunFinishedEvent {
  levelId: string;
  frames: number;
  deaths: number;
  score: number;
  replay: number[];
  versions: RunVersions;
}

export interface GameSceneData {
  levels: readonly Level[];
  startIndex: number;
  input: InputState;
  onFinished?: (event: RunFinishedEvent) => void;
  onRetrySubmit?: () => void;
  onShowLeaderboard?: (levelId: string) => void;
  onStage?: (index: number, total: number) => void;
  /** Watch a stored run instead of playing: its inputs replace the controls. */
  replay?: { inputs: readonly number[]; caption: string };
  onReplayFinished?: () => void;
  /** The inputs of the ghost to race on a level, if there is one. */
  ghostFor?: (levelId: string) => number[] | undefined;
  ghostEnabled?: boolean;
  onGhostToggled?: (on: boolean) => void;
  /** Called with the name of an effect when something audible happens. */
  sound?: (name: SoundName) => void;
  /** Read live: when true, render-only motion (particles, pops, pulses, tweens) is skipped. */
  reducedMotion?: () => boolean;
}

const HEAD_WIDTH = 8;
const HEAD_HEIGHT = 6;
const TORSO_WIDTH = 14;
const TORSO_HEIGHT = 14;
const LEG_WIDTH = 5;
const LEG_SPACING = 4;
const HUD_FONT = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '20px' };
const MAX_TICKS_PER_FRAME = 5;
const GHOST_ALPHA = 0.3;
const SPEED_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;
const NORMAL_SPEED = 1;
const DOT_SIZE = 10;
const DOT_GAP = 8;
const DOT_TOP = 46;
const DEATH_PARTICLES = 10;
const SKYLINE = [3, 5, 2, 4, 6, 3, 5, 2, 4, 3, 6, 2, 5, 4, 3, 6];

interface TileEffect {
  kind: 'pop' | 'vanish';
  bornAt: number;
}

interface LiveParticle {
  particle: Particle;
  bornAt: number;
}

export class GameScene extends Phaser.Scene {
  private levels: readonly Level[] = [];
  private level!: Level;
  private levelText!: Phaser.GameObjects.Text;
  private controls!: InputState;
  private onFinished: ((event: RunFinishedEvent) => void) | undefined;
  private onRetrySubmit: (() => void) | undefined;
  private onShowLeaderboard: ((levelId: string) => void) | undefined;
  private onStage: ((index: number, total: number) => void) | undefined;
  private statusText: Phaser.GameObjects.Text | undefined;
  private state!: GameState;
  private recorded: number[] = [];
  private facing: 1 | -1 = 1;
  private phase = 0;
  private stepper = new FixedStepper(1000 / TICKS_PER_SECOND, MAX_TICKS_PER_FRAME);
  private cursor: ReplayCursor | undefined;
  private caption = '';
  private speed = NORMAL_SPEED;
  private viewerPaused = false;
  private speedText: Phaser.GameObjects.Text | undefined;
  private onReplayFinished: (() => void) | undefined;
  private ghostFor: ((levelId: string) => number[] | undefined) | undefined;
  private ghostOn = false;
  private onGhostToggled: ((on: boolean) => void) | undefined;
  private reducedMotion: (() => boolean) | undefined;
  private onSound: ((name: SoundName) => void) | undefined;
  private ghostInputs: number[] | undefined;
  private ghost: { state: GameState; index: number; facing: 1 | -1; phase: number } | undefined;
  private world!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private deathText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private previousTiles: Uint8Array | undefined;
  private knownDeaths = 0;
  private knownStage = 0;
  private lastPosition = { x: 0, y: 0 };
  private tileEffects = new Map<number, TileEffect>();
  private particles: LiveParticle[] = [];

  constructor() {
    super(SCENE_KEY);
  }

  private get calm(): boolean {
    return this.reducedMotion?.() ?? false;
  }

  private get stage(): Stage {
    return stageOf(this.level, this.state.stage);
  }

  init(data: GameSceneData): void {
    this.levels = data.levels;
    this.level = data.levels[data.startIndex] ?? (data.levels[0] as Level);
    this.controls = data.input;
    this.onFinished = data.onFinished;
    this.onRetrySubmit = data.onRetrySubmit;
    this.onShowLeaderboard = data.onShowLeaderboard;
    this.onStage = data.onStage;
    this.cursor = data.replay ? new ReplayCursor(data.replay.inputs) : undefined;
    this.caption = data.replay?.caption ?? '';
    this.speed = NORMAL_SPEED;
    this.viewerPaused = false;
    this.onReplayFinished = data.onReplayFinished;
    this.ghostFor = data.replay ? undefined : data.ghostFor;
    this.ghostOn = data.ghostEnabled ?? false;
    this.onGhostToggled = data.onGhostToggled;
    this.reducedMotion = data.reducedMotion;
    this.onSound = data.replay ? undefined : data.sound;
    this.stepper = new FixedStepper(
      1000 / TICKS_PER_SECOND,
      data.replay ? MAX_TICKS_PER_FRAME * Math.max(...SPEEDS) : MAX_TICKS_PER_FRAME,
    );
  }

  create(): void {
    this.events.once('shutdown', () => {
      this.statusText = undefined;
      this.speedText = undefined;
    });
    this.drawBackground();
    this.world = this.add.graphics();
    this.levelText = this.add
      .text(this.scale.width / 2, 14, this.levelTitle(), {
        ...HUD_FONT,
        color: PALETTE.inkSoft,
      })
      .setOrigin(0.5, 0);
    this.timeText = this.add.text(16, 14, '', { ...HUD_FONT, color: PALETTE.ink });
    this.deathText = this.add
      .text(this.scale.width - 16, 14, '', { ...HUD_FONT, color: PALETTE.ink })
      .setOrigin(1, 0);

    this.input.keyboard?.on('keydown-R', () => this.restart());
    if (this.cursor) {
      this.createViewerControls();
    } else {
      this.input.keyboard?.on('keydown-L', () => {
        if (this.state.finished) this.onShowLeaderboard?.(this.level.id);
      });
      this.input.keyboard?.on('keydown-S', () => {
        if (this.state.finished) this.onRetrySubmit?.();
      });
      this.input.keyboard?.on('keydown-ENTER', () => {
        if (this.state.finished) this.advance();
      });
      this.input.keyboard?.on('keydown-G', () => this.toggleGhost());
      this.input.on('pointerdown', () => {
        if (this.state.finished) this.advance();
      });
    }
    this.restart();
  }

  override update(_time: number, delta: number): void {
    if (!this.state.finished && !this.viewerPaused) {
      const ticks = this.stepper.advance(delta * this.speed);
      for (let i = 0; i < ticks && !this.state.finished; i++) {
        const mask = this.cursor ? this.cursor.next() : this.controls.mask();
        if (!this.cursor) this.recorded.push(mask);
        const grounded = this.state.onGround;
        step(this.level, this.state, mask);
        this.facing = facingAfter(this.state.vx, this.facing);
        if (grounded && (mask & Input.Jump) !== 0 && this.state.vy < 0) this.onSound?.('jump');
        this.phase = advancePhase(this.phase, this.state.vx, this.state.onGround);
        this.stepGhost();
      }
      if (this.state.finished) {
        if (this.cursor) this.finishReplay();
        else this.finishRun();
      } else if (this.cursor?.done) {
        this.finishReplay();
      } else if (this.state.tick >= this.level.maxFrames) {
        this.restart();
      }
    }
    this.render();
  }

  private createViewerControls(): void {
    this.speedText = this.add
      .text(16, this.scale.height - 34, '', {
        ...HUD_FONT,
        fontSize: '16px',
        color: PALETTE.inkSoft,
      })
      .setOrigin(0, 0);
    SPEEDS.forEach((_, index) => {
      this.input.keyboard?.on(`keydown-${SPEED_KEYS[index]}`, () => {
        this.speed = SPEEDS[index] ?? NORMAL_SPEED;
      });
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.state.finished) this.viewerPaused = !this.viewerPaused;
    });
    this.input.on('pointerdown', () => {
      if (this.state.finished) this.restart();
    });
  }

  private toggleGhost(): void {
    this.ghostOn = !this.ghostOn;
    this.onGhostToggled?.(this.ghostOn);
    if (this.ghostOn) {
      this.startGhost(this.state.tick);
      this.announce(this.ghostInputs ? 'Ghost on' : 'No ghost yet');
    } else {
      this.ghost = undefined;
      this.announce('Ghost off');
    }
  }

  /** Sets the ghost of this level up and brings it to tick `tick`, where the player is. */
  private startGhost(tick: number): void {
    this.ghost = undefined;
    this.ghostInputs = this.ghostOn ? this.ghostFor?.(this.level.id) : undefined;
    if (!this.ghostInputs) return;
    this.ghost = { state: createState(this.level), index: 0, facing: 1, phase: 0 };
    for (let i = 0; i < tick; i++) this.stepGhost();
  }

  private stepGhost(): void {
    const ghost = this.ghost;
    const inputs = this.ghostInputs;
    if (!ghost || !inputs) return;
    if (ghost.state.finished || ghost.index >= inputs.length) {
      this.ghost = undefined;
      return;
    }
    const mask = inputs[ghost.index] ?? 0;
    ghost.index += 1;
    step(this.level, ghost.state, mask);
    ghost.facing = facingAfter(ghost.state.vx, ghost.facing);
    ghost.phase = advancePhase(ghost.phase, ghost.state.vx, ghost.state.onGround);
  }

  /** Fades a short text in the upper middle of the screen; render only. */
  private announce(text: string): void {
    const label = this.add
      .text(this.scale.width / 2, 92, text, { ...HUD_FONT, fontSize: '32px', color: PALETTE.ink })
      .setOrigin(0.5, 0);
    this.tweens.add({
      targets: label,
      alpha: 0,
      ...(this.calm ? {} : { y: 78 }),
      duration: 900,
      ease: 'Quad.easeIn',
      onComplete: () => label.destroy(),
    });
  }

  /** Shows a line below the result on the finish screen, for example the rank. */
  setStatus(text: string): void {
    this.statusText?.setText(text);
  }

  /** Number and name of the level being played, for menus. */
  get title(): string {
    return this.levelTitle();
  }

  /** Starts the current level again from its first stage. */
  restartRun(): void {
    this.restart();
  }

  private levelTitle(): string {
    const title = `${this.levels.indexOf(this.level) + 1}. ${this.level.name}`;
    return this.cursor ? `${this.caption} · ${title}` : title;
  }

  /** After a finished level: the next level, or the first one again after the last. */
  private advance(): void {
    const next = nextLevel(this.levels, this.level.id) ?? this.levels[0];
    if (next) this.level = next;
    this.levelText.setText(this.levelTitle());
    this.restart();
  }

  private restart(): void {
    for (const object of this.overlay) object.destroy();
    this.overlay = [];
    this.statusText = undefined;
    this.state = createState(this.level);
    this.recorded = [];
    this.facing = 1;
    this.phase = 0;
    this.previousTiles = undefined;
    this.knownDeaths = 0;
    this.knownStage = 0;
    this.lastPosition = { x: this.state.x, y: this.state.y };
    this.tileEffects.clear();
    this.particles = [];
    this.stepper.reset();
    this.cursor?.reset();
    this.viewerPaused = false;
    this.startGhost(0);
  }

  private finishReplay(): void {
    const { width, height } = this.scale;
    const shade = this.add
      .rectangle(0, 0, width, height, colorNumber('paper'), 0.88)
      .setOrigin(0, 0);
    const title = this.add
      .text(width / 2, height / 2 - 40, this.state.finished ? 'Replay finished' : 'Replay ended', {
        ...HUD_FONT,
        fontSize: '44px',
        color: PALETTE.ink,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height / 2 + 30, 'R or tap: watch again  ·  Esc: close', {
        ...HUD_FONT,
        color: PALETTE.inkSoft,
      })
      .setOrigin(0.5);
    this.overlay = [shade, title, hint];
    this.state.finished = true;
    this.onReplayFinished?.();
  }

  private finishRun(): void {
    const frames = this.state.tick;
    const deaths = this.state.deaths;
    const score = scoreRun(this.level.parFrames, { frames, deaths });
    const { width, height } = this.scale;
    const shade = this.add
      .rectangle(0, 0, width, height, colorNumber('paper'), 0.88)
      .setOrigin(0, 0);
    const next = nextLevel(this.levels, this.level.id);
    const title = this.add
      .text(width / 2, height / 2 - 70, next ? 'Cleared. Somehow.' : 'That was the last one.', {
        ...HUD_FONT,
        fontSize: '44px',
        color: PALETTE.ink,
      })
      .setOrigin(0.5);
    const summary = this.add
      .text(
        width / 2,
        height / 2,
        `${formatTime(frames)}   ·   ${deaths} deaths   ·   ${score} pts`,
        {
          ...HUD_FONT,
          fontSize: '30px',
          color: PALETTE.ink,
        },
      )
      .setOrigin(0.5);
    const hint = this.add
      .text(
        width / 2,
        height / 2 + 70,
        next
          ? 'Enter or tap: next level  ·  R: again  ·  L: leaderboard'
          : 'Enter or tap: start over  ·  R: again  ·  L: leaderboard',
        {
          ...HUD_FONT,
          color: PALETTE.inkSoft,
        },
      )
      .setOrigin(0.5);
    this.statusText = this.add
      .text(width / 2, height / 2 + 36, '', { ...HUD_FONT, color: PALETTE.ink })
      .setOrigin(0.5);
    this.overlay = [shade, title, summary, hint, this.statusText];

    this.onSound?.('exit');
    const event: RunFinishedEvent = {
      levelId: this.level.id,
      frames,
      deaths,
      score,
      replay: encodeReplay(this.recorded),
      versions: runVersions(this.level),
    };
    this.events.emit(RUN_FINISHED, event);
    this.onFinished?.(event);
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    const { width, height } = this.scale;
    g.fillStyle(colorNumber('paper'));
    g.fillRect(0, 0, width, height);
    g.fillStyle(colorNumber('paperShade'));
    for (let tx = 0; tx < stageOf(this.level, 0).width; tx += 2) {
      const tiles = SKYLINE[(tx / 2) % SKYLINE.length] ?? 3;
      g.fillRect(tx * TILE_SIZE, height - tiles * TILE_SIZE, TILE_SIZE * 2, tiles * TILE_SIZE);
    }
  }

  private render(): void {
    const now = this.time.now;
    this.trackEffects(now);
    const g = this.world;
    g.clear();
    this.renderZones(g);
    this.renderHalo(g, now);
    this.renderTiles(g, now);
    this.renderPlatforms(g);
    this.renderExit(g);
    this.renderParticles(g, now);
    if (this.ghost && this.ghost.state.stage === this.state.stage) {
      this.renderFigure(g, this.ghost.state, this.ghost.facing, this.ghost.phase, GHOST_ALPHA);
    }
    this.renderFigure(g, this.state, this.facing, this.phase, 1);
    this.renderStageDots(g);
    this.timeText.setText(formatTime(this.state.tick));
    this.deathText.setText(`Deaths ${this.state.deaths}`);
    this.speedText?.setText(this.viewerLine());
  }

  private viewerLine(): string {
    const paused = this.viewerPaused ? '  ·  paused' : '';
    return `${this.speed}x${paused}  ·  1-5 speed  ·  Space pause  ·  R again  ·  Esc close`;
  }

  private trackEffects(now: number): void {
    if (this.state.stage !== this.knownStage) {
      this.onSound?.('exit');
      this.announce(`Stage ${this.state.stage + 1}`);
      this.onStage?.(this.state.stage, this.level.stages.length);
      this.knownStage = this.state.stage;
      this.knownDeaths = this.state.deaths;
      this.tileEffects.clear();
    } else if (this.state.deaths !== this.knownDeaths) {
      this.knownDeaths = this.state.deaths;
      this.onSound?.('death');
      const origin = {
        x: this.lastPosition.x + PLAYER_WIDTH / 2,
        y: this.lastPosition.y + PLAYER_HEIGHT / 2,
      };
      if (!this.calm) {
        this.cameras.main.shake(DEATH_SHAKE.durationMs, DEATH_SHAKE.intensity);
        for (const particle of burst(origin, DEATH_PARTICLES)) {
          this.particles.push({ particle, bornAt: now });
        }
      }
      this.tileEffects.clear();
    } else if (this.previousTiles) {
      const changes = tileChanges(this.previousTiles, this.state.tiles);
      if (changes.length > 0) this.onSound?.('trap');
      for (const change of this.calm ? [] : changes) {
        if (change.to === Tile.Spike) {
          this.tileEffects.set(change.index, { kind: 'pop', bornAt: now });
        } else if (change.from === Tile.Solid && change.to === Tile.Air) {
          this.tileEffects.set(change.index, { kind: 'vanish', bornAt: now });
        }
      }
    }
    this.previousTiles = this.state.tiles.slice();
    this.lastPosition = { x: this.state.x, y: this.state.y };
  }

  private renderPlatforms(g: Phaser.GameObjects.Graphics): void {
    for (const platform of this.stage.platforms) {
      const rect = platformRect(platform, this.state.stageTick);
      g.fillStyle(colorNumber('ink'));
      g.fillRect(rect.x, rect.y, rect.width, 12);
      g.fillStyle(colorNumber('inkSoft'));
      g.fillRect(rect.x, rect.y, rect.width, 3);
      g.fillStyle(colorNumber('ink'));
      g.fillRect(rect.x + 4, rect.y + 12, 4, 6);
      g.fillRect(rect.x + rect.width - 8, rect.y + 12, 4, 6);
    }
  }

  /** A faint tint with a mark for each zone: arrows for inverted controls, chevrons for floating. */
  private renderZones(g: Phaser.GameObjects.Graphics): void {
    for (const zone of this.stage.zones) {
      const left = zone.x * TILE_SIZE;
      const top = zone.y * TILE_SIZE;
      const width = zone.width * TILE_SIZE;
      const height = zone.height * TILE_SIZE;
      const inverted = zone.effect === 'invert';
      g.fillStyle(colorNumber(inverted ? 'accent' : 'ink'), inverted ? 0.07 : 0.05);
      g.fillRect(left, top, width, height);
      g.lineStyle(2, colorNumber(inverted ? 'accent' : 'inkSoft'), 0.5);
      const midY = top + height / 2;
      for (let x = left + TILE_SIZE; x < left + width; x += TILE_SIZE * 2) {
        if (inverted) {
          g.lineBetween(x - 8, midY, x + 8, midY);
          g.lineBetween(x - 8, midY, x - 3, midY - 5);
          g.lineBetween(x + 8, midY, x + 3, midY + 5);
        } else {
          g.lineBetween(x - 6, midY + 4, x, midY - 4);
          g.lineBetween(x, midY - 4, x + 6, midY + 4);
        }
      }
    }
  }

  private renderTiles(g: Phaser.GameObjects.Graphics, now: number): void {
    const { width, height } = this.stage;
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const index = ty * width + tx;
        const look = appearanceOf(this.state.tiles[index]);
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        if (look === 'solid') {
          g.fillStyle(colorNumber('ink'));
          g.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          g.fillStyle(colorNumber('inkLift'));
          g.fillRect(x + TILE_SIZE - 1, y, 1, TILE_SIZE);
          g.fillRect(x, y + TILE_SIZE - 1, TILE_SIZE, 1);
          const above = ty > 0 ? appearanceOf(this.state.tiles[index - width]) : 'solid';
          if (above !== 'solid') {
            g.fillStyle(colorNumber('inkSoft'));
            g.fillRect(x, y, TILE_SIZE, 3);
          }
        } else if (look === 'exit') {
          this.drawDoor(g, x, y);
        } else if (look === 'spike') {
          const effect = this.tileEffects.get(index);
          const scale = effect?.kind === 'pop' ? popScale(now - effect.bornAt) : 1;
          if (effect?.kind === 'pop' && now - effect.bornAt >= POP_MS)
            this.tileEffects.delete(index);
          this.drawSpike(g, x, y, scale);
        }
      }
    }
    for (const [index, effect] of this.tileEffects) {
      if (effect.kind !== 'vanish') continue;
      const age = now - effect.bornAt;
      if (age >= VANISH_MS) {
        this.tileEffects.delete(index);
        continue;
      }
      const size = TILE_SIZE * vanishScale(age);
      const x = (index % width) * TILE_SIZE + (TILE_SIZE - size) / 2;
      const y = Math.floor(index / width) * TILE_SIZE + (TILE_SIZE - size) / 2;
      g.fillStyle(colorNumber('ink'));
      g.fillRect(x, y, size, size);
    }
  }

  private drawSpike(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
    const baseY = y + TILE_SIZE;
    const apexY = baseY - (TILE_SIZE - 6) * scale;
    const left = x + 2;
    const right = x + TILE_SIZE - 2;
    const middle = x + TILE_SIZE / 2;
    g.fillStyle(colorNumber('accent'));
    g.fillTriangle(left, baseY, middle, apexY, right, baseY);
    g.fillStyle(colorNumber('accentDark'));
    g.fillTriangle(middle, apexY, right, baseY, middle, baseY);
  }

  private renderHalo(g: Phaser.GameObjects.Graphics, now: number): void {
    const x = this.stage.exit.x * TILE_SIZE + TILE_SIZE / 2;
    const y = this.stage.exit.y * TILE_SIZE + TILE_SIZE / 2;
    g.fillStyle(colorNumber('paper'));
    g.fillCircle(x, y, TILE_SIZE * 0.85 + (this.calm ? 0 : Math.sin(now / 350) * 2));
  }

  private renderExit(g: Phaser.GameObjects.Graphics): void {
    this.drawDoor(g, this.stage.exit.x * TILE_SIZE, this.stage.exit.y * TILE_SIZE);
  }

  private drawDoor(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(colorNumber('ink'));
    g.fillRoundedRect(x + 4, y + 2, TILE_SIZE - 8, TILE_SIZE - 2, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(colorNumber('paper'));
    g.fillRoundedRect(x + 9, y + 8, TILE_SIZE - 18, TILE_SIZE - 8, { tl: 7, tr: 7, bl: 0, br: 0 });
  }

  private renderParticles(g: Phaser.GameObjects.Graphics, now: number): void {
    this.particles = this.particles.filter(({ particle, bornAt }) => {
      const at = particleAt(particle, now - bornAt);
      if (!at) return false;
      g.fillStyle(colorNumber('ink'), at.alpha);
      g.fillRect(at.x - 2, at.y - 2, 4, 4);
      return true;
    });
  }

  private renderStageDots(g: Phaser.GameObjects.Graphics): void {
    const dots = stageDots(this.state.stage, this.level.stages.length);
    const total = dots.length * DOT_SIZE + (dots.length - 1) * DOT_GAP;
    const left = (this.scale.width - total) / 2;
    dots.forEach((dot, index) => {
      const x = left + index * (DOT_SIZE + DOT_GAP);
      if (dot === 'todo') {
        g.lineStyle(2, colorNumber('ink'));
        g.strokeRect(x + 1, DOT_TOP + 1, DOT_SIZE - 2, DOT_SIZE - 2);
      } else {
        g.fillStyle(colorNumber('ink'));
        g.fillRect(x, DOT_TOP, DOT_SIZE, DOT_SIZE);
      }
    });
  }

  private renderFigure(
    g: Phaser.GameObjects.Graphics,
    figure: GameState,
    facing: 1 | -1,
    phase: number,
    alpha: number,
  ): void {
    const pose = figurePose({ vx: figure.vx, vy: figure.vy, onGround: figure.onGround }, phase);
    const centre = figure.x + PLAYER_WIDTH / 2;
    const top = figure.y + pose.bob;
    const hipY = top + HEAD_HEIGHT + TORSO_HEIGHT - 1;

    g.fillStyle(colorNumber('ink'), alpha);
    g.fillRect(centre - HEAD_WIDTH / 2, top, HEAD_WIDTH, HEAD_HEIGHT);
    g.fillRect(centre - TORSO_WIDTH / 2, top + HEAD_HEIGHT, TORSO_WIDTH, TORSO_HEIGHT);

    g.lineStyle(LEG_WIDTH, colorNumber('ink'), alpha);
    for (const [leg, side] of [
      [pose.back, -facing],
      [pose.front, facing],
    ] as const) {
      const hip = { x: centre + side * LEG_SPACING, y: hipY };
      const foot = legFoot(hip, leg, facing);
      g.lineBetween(hip.x, hip.y, foot.x, foot.y);
    }
  }
}
