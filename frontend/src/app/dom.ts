interface Props {
  class?: string;
  text?: string;
  type?: string;
  disabled?: boolean;
  onClick?: () => void;
}

/** Builds an element with optional class, text, click handler and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.type && element instanceof HTMLButtonElement) element.type = props.type as 'button';
  if (props.disabled && element instanceof HTMLButtonElement) element.disabled = true;
  if (props.onClick) element.addEventListener('click', props.onClick);
  element.append(...children);
  return element;
}
