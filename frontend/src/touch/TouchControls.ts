import { Input } from '@trust-issues/sim';
import type { InputState } from '../input/InputState';

interface TouchButton {
  label: string;
  ariaLabel: string;
  bit: number;
  side: 'left' | 'right';
}

const BUTTONS: readonly TouchButton[] = [
  { label: '◀', ariaLabel: 'Move left', bit: Input.Left, side: 'left' },
  { label: '▶', ariaLabel: 'Move right', bit: Input.Right, side: 'left' },
  { label: '▲', ariaLabel: 'Jump', bit: Input.Jump, side: 'right' },
];

/**
 * On-screen buttons that feed the shared `InputState`. Pointer capture keeps a button held
 * while the finger drifts, and releasing happens on every way a press can end.
 */
export function mountTouchControls(
  parent: HTMLElement,
  input: InputState,
  onMenu?: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'touch-controls';
  const groups = {
    left: document.createElement('div'),
    right: document.createElement('div'),
  };
  for (const group of Object.values(groups)) {
    group.className = 'touch-group';
    root.append(group);
  }

  for (const { label, ariaLabel, bit, side } of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'touch-button';
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    const release = () => input.setTouch(bit, false);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      input.setTouch(bit, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    groups[side].append(button);
  }

  if (onMenu) {
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'touch-menu';
    menu.textContent = 'Menu';
    menu.addEventListener('click', onMenu);
    root.insertBefore(menu, groups.right);
  }

  parent.append(root);
  return () => {
    input.setTouch(Input.Left | Input.Right | Input.Jump, false);
    root.remove();
  };
}
