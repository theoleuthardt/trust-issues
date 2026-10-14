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

const HUD_FONT = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '20px' };
const MAX_TICKS_PER_FRAME = 5;
const STAR_COUNT = 60;
const HUD_HEIGHT = 48;

export class GameScene extends Phaser.Scene {
  private level!: Level;
  private controls!: InputState;
  private state!: GameState;
  private recorded: number[] = [];
  private facing = 1;
  private readonly stepper = new FixedStepper(1000 / TICKS_PER_SECOND, MAX_TICKS_PER_FRAME);
  private world!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private deathText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];

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
        color: PALETTE.textDim,
      })
      .setOrigin(0.5, 0);
    this.timeText = this.add.text(16, 14, '', { ...HUD_FONT, color: PALETTE.text });
    this.deathText = this.add
      .text(this.scale.width - 16, 14, '', { ...HUD_FONT, color: PALETTE.text })
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
    this.stepper.reset();
  }

  private finishRun(): void {
    const frames = this.state.tick;
    const deaths = this.state.deaths;
    const { width, height } = this.scale;
    const shade = this.add
      .rectangle(0, 0, width, height, colorNumber('night'), 0.78)
      .setOrigin(0, 0);
    const title = this.add
      .text(width / 2, height / 2 - 70, 'Cleared. Somehow.', {
        ...HUD_FONT,
        fontSize: '44px',
        color: PALETTE.groundTop,
      })
      .setOrigin(0.5);
    const summary = this.add
      .text(width / 2, height / 2, `${formatTime(frames)}   ·   ${deaths} deaths`, {
        ...HUD_FONT,
        fontSize: '30px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height / 2 + 70, 'Press R or tap to try again', {
        ...HUD_FONT,
        color: PALETTE.textDim,
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
    g.fillStyle(colorNumber('night'));
    g.fillRect(0, 0, this.scale.width, this.scale.height);
    g.fillStyle(colorNumber('nightFar'));
    g.fillRect(0, this.scale.height * 0.55, this.scale.width, this.scale.height * 0.45);
    g.fillStyle(colorNumber('star'));
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = (i * 197) % this.scale.width;
      const y = HUD_HEIGHT + ((i * 89 + (i % 7) * 31) % (this.scale.height * 0.45));
      const size = 2 + (i % 3);
      g.fillRect(x, y, size, size);
    }
  }

  private render(): void {
    const g = this.world;
    g.clear();
    this.renderTiles(g);
    this.renderExit(g);
    this.renderPlayer(g);
    this.timeText.setText(formatTime(this.state.tick));
    this.deathText.setText(`Deaths ${this.state.deaths}`);
  }

  private renderTiles(g: Phaser.GameObjects.Graphics): void {
    const { width, height } = this.level;
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tile = this.state.tiles[ty * width + tx];
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        if (tile === Tile.Solid) {
          g.fillStyle(colorNumber('ground'));
          g.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          g.lineStyle(1, colorNumber('groundLine'));
          g.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          const above = ty > 0 ? this.state.tiles[(ty - 1) * width + tx] : Tile.Solid;
          if (above !== Tile.Solid) {
            g.fillStyle(colorNumber('groundTop'));
            g.fillRect(x, y, TILE_SIZE, 6);
          }
        } else if (tile === Tile.Spike) {
          g.fillStyle(colorNumber('spike'));
          g.fillTriangle(
            x + 2,
            y + TILE_SIZE,
            x + TILE_SIZE / 2,
            y + 6,
            x + TILE_SIZE - 2,
            y + TILE_SIZE,
          );
          g.fillStyle(colorNumber('spikeShade'));
          g.fillTriangle(
            x + TILE_SIZE / 2,
            y + 6,
            x + TILE_SIZE - 2,
            y + TILE_SIZE,
            x + TILE_SIZE / 2,
            y + TILE_SIZE,
          );
        }
      }
    }
  }

  private renderExit(g: Phaser.GameObjects.Graphics): void {
    const x = this.level.exit.x * TILE_SIZE;
    const y = this.level.exit.y * TILE_SIZE;
    const pulse = 0.12 + 0.06 * Math.sin(this.time.now / 300);
    g.fillStyle(colorNumber('glow'), pulse);
    g.fillCircle(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE * 1.1);
    g.fillStyle(colorNumber('door'));
    g.fillRoundedRect(x + 3, y + 1, TILE_SIZE - 6, TILE_SIZE - 1, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.fillStyle(colorNumber('doorInside'));
    g.fillRoundedRect(x + 8, y + 6, TILE_SIZE - 16, TILE_SIZE - 6, { tl: 6, tr: 6, bl: 0, br: 0 });
  }

  private renderPlayer(g: Phaser.GameObjects.Graphics): void {
    const stretch = 1 + Math.min(Math.abs(this.state.vy), 9.5) / 32;
    const width = PLAYER_WIDTH / Math.sqrt(stretch);
    const height = PLAYER_HEIGHT * Math.sqrt(stretch);
    const x = this.state.x + (PLAYER_WIDTH - width) / 2;
    const y = this.state.y + PLAYER_HEIGHT - height;

    g.fillStyle(colorNumber('player'));
    g.fillRoundedRect(x, y, width, height, 7);
    g.lineStyle(2, colorNumber('outline'));
    g.strokeRoundedRect(x, y, width, height, 7);
    g.fillStyle(colorNumber('playerShade'));
    g.fillRect(x + 3, y + height - 6, width - 6, 3);

    const eyeShift = this.facing * 2;
    g.fillStyle(colorNumber('eye'));
    g.fillRect(x + width * 0.28 + eyeShift, y + height * 0.28, 4, 7);
    g.fillRect(x + width * 0.62 + eyeShift, y + height * 0.28, 4, 7);
  }
}
