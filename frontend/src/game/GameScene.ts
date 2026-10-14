import Phaser from 'phaser';
import {
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TICKS_PER_SECOND,
  TILE_SIZE,
  Tile,
  createState,
  encodeReplay,
  step,
} from '@trust-issues/sim';
import type { GameState, Level } from '@trust-issues/sim';
import { Input } from '@trust-issues/sim';
import { formatTime } from '../format';
import type { InputState } from '../input/InputState';
import { FixedStepper } from '../loop';
import {
  POP_MS,
  VANISH_MS,
  burst,
  particleAt,
  popScale,
  tileChanges,
  vanishScale,
} from './effects';
import type { Particle } from './effects';
import { advancePhase, figurePose, legFoot } from './figure';
import { PALETTE, colorNumber } from '../theme';

export const SCENE_KEY = 'game';

/** Emitted on the scene's event emitter when the player reaches the exit. */
export const RUN_FINISHED = 'run-finished';

export interface RunFinishedEvent {
  levelId: string;
  frames: number;
  deaths: number;
  replay: number[];
}

export interface GameSceneData {
  level: Level;
  input: InputState;
}

const HEAD_WIDTH = 8;
const HEAD_HEIGHT = 6;
const TORSO_WIDTH = 14;
const TORSO_HEIGHT = 14;
const LEG_WIDTH = 5;
const LEG_SPACING = 4;
const HUD_FONT = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '20px' };
const MAX_TICKS_PER_FRAME = 5;
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
  private level!: Level;
  private controls!: InputState;
  private state!: GameState;
  private recorded: number[] = [];
  private facing: 1 | -1 = 1;
  private phase = 0;
  private readonly stepper = new FixedStepper(1000 / TICKS_PER_SECOND, MAX_TICKS_PER_FRAME);
  private world!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private deathText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private previousTiles: Uint8Array | undefined;
  private knownDeaths = 0;
  private lastPosition = { x: 0, y: 0 };
  private tileEffects = new Map<number, TileEffect>();
  private particles: LiveParticle[] = [];

  constructor() {
    super(SCENE_KEY);
  }

  init(data: GameSceneData): void {
    this.level = data.level;
    this.controls = data.input;
  }

  create(): void {
    this.drawBackground();
    this.world = this.add.graphics();
    this.add
      .text(this.scale.width / 2, 14, this.level.name, {
        ...HUD_FONT,
        color: PALETTE.inkSoft,
      })
      .setOrigin(0.5, 0);
    this.timeText = this.add.text(16, 14, '', { ...HUD_FONT, color: PALETTE.ink });
    this.deathText = this.add
      .text(this.scale.width - 16, 14, '', { ...HUD_FONT, color: PALETTE.ink })
      .setOrigin(1, 0);

    this.input.keyboard?.on('keydown-R', () => this.restart());
    this.input.on('pointerdown', () => {
      if (this.state.finished) this.restart();
    });
    this.restart();
  }

  override update(_time: number, delta: number): void {
    if (!this.state.finished) {
      const ticks = this.stepper.advance(delta);
      for (let i = 0; i < ticks && !this.state.finished; i++) {
        const mask = this.controls.mask();
        if ((mask & Input.Right) !== 0 && (mask & Input.Left) === 0) this.facing = 1;
        if ((mask & Input.Left) !== 0 && (mask & Input.Right) === 0) this.facing = -1;
        this.recorded.push(mask);
        step(this.level, this.state, mask);
        this.phase = advancePhase(this.phase, this.state.vx, this.state.onGround);
      }
      if (this.state.finished) this.finishRun();
      else if (this.state.tick >= this.level.maxFrames) this.restart();
    }
    this.render();
  }

  private restart(): void {
    for (const object of this.overlay) object.destroy();
    this.overlay = [];
    this.state = createState(this.level);
    this.recorded = [];
    this.facing = 1;
    this.phase = 0;
    this.previousTiles = undefined;
    this.knownDeaths = 0;
    this.tileEffects.clear();
    this.particles = [];
    this.stepper.reset();
  }

  private finishRun(): void {
    const frames = this.state.tick;
    const deaths = this.state.deaths;
    const { width, height } = this.scale;
    const shade = this.add
      .rectangle(0, 0, width, height, colorNumber('paper'), 0.88)
      .setOrigin(0, 0);
    const title = this.add
      .text(width / 2, height / 2 - 70, 'Cleared. Somehow.', {
        ...HUD_FONT,
        fontSize: '44px',
        color: PALETTE.accent,
      })
      .setOrigin(0.5);
    const summary = this.add
      .text(width / 2, height / 2, `${formatTime(frames)}   ·   ${deaths} deaths`, {
        ...HUD_FONT,
        fontSize: '30px',
        color: PALETTE.ink,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height / 2 + 70, 'Press R or tap to try again', {
        ...HUD_FONT,
        color: PALETTE.inkSoft,
      })
      .setOrigin(0.5);
    this.overlay = [shade, title, summary, hint];

    const event: RunFinishedEvent = {
      levelId: this.level.id,
      frames,
      deaths,
      replay: encodeReplay(this.recorded),
    };
    this.events.emit(RUN_FINISHED, event);
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    const { width, height } = this.scale;
    g.fillStyle(colorNumber('paper'));
    g.fillRect(0, 0, width, height);
    g.fillStyle(colorNumber('paperShade'));
    for (let tx = 0; tx < this.level.width; tx += 2) {
      const tiles = SKYLINE[(tx / 2) % SKYLINE.length] ?? 3;
      g.fillRect(tx * TILE_SIZE, height - tiles * TILE_SIZE, TILE_SIZE * 2, tiles * TILE_SIZE);
    }
  }

  private render(): void {
    const now = this.time.now;
    this.trackEffects(now);
    const g = this.world;
    g.clear();
    this.renderTiles(g, now);
    this.renderExit(g, now);
    this.renderParticles(g, now);
    this.renderPlayer(g);
    this.timeText.setText(formatTime(this.state.tick));
    this.deathText.setText(`Deaths ${this.state.deaths}`);
  }

  private trackEffects(now: number): void {
    if (this.state.deaths !== this.knownDeaths) {
      this.knownDeaths = this.state.deaths;
      const origin = {
        x: this.lastPosition.x + PLAYER_WIDTH / 2,
        y: this.lastPosition.y + PLAYER_HEIGHT / 2,
      };
      for (const particle of burst(origin, DEATH_PARTICLES)) {
        this.particles.push({ particle, bornAt: now });
      }
      this.tileEffects.clear();
    } else if (this.previousTiles) {
      for (const change of tileChanges(this.previousTiles, this.state.tiles)) {
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

  private renderTiles(g: Phaser.GameObjects.Graphics, now: number): void {
    const { width, height } = this.level;
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const index = ty * width + tx;
        const tile = this.state.tiles[index];
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        if (tile === Tile.Solid) {
          g.fillStyle(colorNumber('ink'));
          g.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          g.fillStyle(colorNumber('inkLift'));
          g.fillRect(x + TILE_SIZE - 1, y, 1, TILE_SIZE);
          g.fillRect(x, y + TILE_SIZE - 1, TILE_SIZE, 1);
          const above = ty > 0 ? this.state.tiles[index - width] : Tile.Solid;
          if (above !== Tile.Solid) {
            g.fillStyle(colorNumber('inkSoft'));
            g.fillRect(x, y, TILE_SIZE, 3);
          }
        } else if (tile === Tile.Spike) {
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

  private renderExit(g: Phaser.GameObjects.Graphics, now: number): void {
    const x = this.level.exit.x * TILE_SIZE;
    const y = this.level.exit.y * TILE_SIZE;
    const halo = TILE_SIZE * 0.85 + Math.sin(now / 350) * 2;
    g.fillStyle(colorNumber('paper'));
    g.fillCircle(x + TILE_SIZE / 2, y + TILE_SIZE / 2, halo);
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

  private renderPlayer(g: Phaser.GameObjects.Graphics): void {
    const pose = figurePose(
      { vx: this.state.vx, vy: this.state.vy, onGround: this.state.onGround },
      this.phase,
    );
    const centre = this.state.x + PLAYER_WIDTH / 2;
    const top = this.state.y + pose.bob;
    const hipY = top + HEAD_HEIGHT + TORSO_HEIGHT - 1;

    g.fillStyle(colorNumber('ink'));
    g.fillRect(centre - HEAD_WIDTH / 2, top, HEAD_WIDTH, HEAD_HEIGHT);
    g.fillRect(centre - TORSO_WIDTH / 2, top + HEAD_HEIGHT, TORSO_WIDTH, TORSO_HEIGHT);

    g.lineStyle(LEG_WIDTH, colorNumber('ink'));
    for (const [leg, side] of [
      [pose.back, -this.facing],
      [pose.front, this.facing],
    ] as const) {
      const hip = { x: centre + side * LEG_SPACING, y: hipY };
      const foot = legFoot(hip, leg, this.facing);
      g.lineBetween(hip.x, hip.y, foot.x, foot.y);
    }
  }
}
