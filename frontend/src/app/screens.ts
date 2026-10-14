import { formatTime } from '../format';
import { h } from './dom';
import type { LevelCard } from './progress';

const button = (label: string, onClick: () => void, primary = false) =>
  h('button', {
    class: primary ? 'button button-primary' : 'button',
    type: 'button',
    onClick,
    text: label,
  });

/** The first screen: the name of the game and the way in. */
export function titleScreen(onPlay: () => void): HTMLElement {
  return h(
    'section',
    { class: 'screen screen-title' },
    h('h1', { class: 'logo', text: 'Trust Issues' }),
    h('p', { class: 'tagline', text: 'Nothing is what it seems.' }),
    h('div', { class: 'stack' }, button('Play', onPlay, true)),
  );
}

export interface MainMenuOptions {
  continueLabel: string;
  onContinue: () => void;
  onLevels: () => void;
  onBack: () => void;
}

export function mainMenu(options: MainMenuOptions): HTMLElement {
  return h(
    'section',
    { class: 'screen' },
    h('h2', { class: 'heading', text: 'Trust Issues' }),
    h(
      'div',
      { class: 'stack' },
      button(options.continueLabel, options.onContinue, true),
      button('Levels', options.onLevels),
      button('Back', options.onBack),
    ),
  );
}

function cardDetail(card: LevelCard): string {
  if (card.status === 'locked') return 'Locked';
  if (!card.best) return `${card.stages} stages`;
  return `${card.best.score} pts · ${formatTime(card.best.frames)}`;
}

export function levelSelect(
  cards: readonly LevelCard[],
  onPick: (index: number) => void,
  onBack: () => void,
): HTMLElement {
  const grid = h('div', { class: 'cards' });
  for (const card of cards) {
    const element = h(
      'button',
      {
        class: `card card-${card.status}`,
        type: 'button',
        disabled: card.status === 'locked',
        onClick: () => onPick(card.index),
      },
      h('span', { class: 'card-number', text: String(card.number) }),
      h('span', { class: 'card-name', text: card.status === 'locked' ? '???' : card.name }),
      h('span', { class: 'card-detail', text: cardDetail(card) }),
    );
    element.setAttribute('aria-label', `Level ${card.number}, ${card.status}`);
    grid.append(element);
  }
  return h(
    'section',
    { class: 'screen screen-levels' },
    h('h2', { class: 'heading', text: 'Levels' }),
    grid,
    h('div', { class: 'stack' }, button('Back', onBack)),
  );
}
