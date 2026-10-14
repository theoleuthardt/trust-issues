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
    g.fillStyle(colorNumber('paper'));
    g.fillRect(0, 0, this.scale.width, this.scale.height);
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
          g.fillStyle(colorNumber('ink'));
          g.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        } else if (tile === Tile.Spike) {
          g.fillStyle(colorNumber('accent'));
          g.fillTriangle(
            x + 2,
            y + TILE_SIZE,
            x + TILE_SIZE / 2,
            y + 6,
            x + TILE_SIZE - 2,
            y + TILE_SIZE,
          );
        }
      }
    }
  }

  private renderExit(g: Phaser.GameObjects.Graphics): void {
    const x = this.level.exit.x * TILE_SIZE;
    const y = this.level.exit.y * TILE_SIZE;
    g.fillStyle(colorNumber('ink'));
    g.fillRoundedRect(x + 4, y + 2, TILE_SIZE - 8, TILE_SIZE - 2, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(colorNumber('paper'));
    g.fillRoundedRect(x + 9, y + 8, TILE_SIZE - 18, TILE_SIZE - 8, { tl: 7, tr: 7, bl: 0, br: 0 });
  }

  private renderPlayer(g: Phaser.GameObjects.Graphics): void {
    const stretch = 1 + Math.min(Math.abs(this.state.vy), 9.5) / 32;
    const width = PLAYER_WIDTH / Math.sqrt(stretch);
    const height = PLAYER_HEIGHT * Math.sqrt(stretch);
    const x = this.state.x + (PLAYER_WIDTH - width) / 2;
    const y = this.state.y + PLAYER_HEIGHT - height;

    g.fillStyle(colorNumber('ink'));
    g.fillRoundedRect(x, y, width, height, 7);

    const eyeShift = this.facing * 2;
    g.fillStyle(colorNumber('paper'));
    g.fillRect(x + width * 0.28 + eyeShift, y + height * 0.28, 4, 7);
    g.fillRect(x + width * 0.62 + eyeShift, y + height * 0.28, 4, 7);
  }
}
