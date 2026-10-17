/** @jest-environment jsdom */

let mockId = '';
const mockState = {
  modals: {} as Record<
    string,
    {
      isOpen: boolean;
      openOnLoad: boolean;
      animationDuration: number;
    }
  >,
};
const mockActions: { init?: () => void } = {};
jest.mock(
  '@wordpress/interactivity',
  () => ({
    store: (_name: string, config: { actions: object }) => {
      Object.assign(mockActions, config.actions);
      return { state: mockState };
    },
    getContext: () => ({ id: mockId }),
  }),
  { virtual: true }
);

beforeAll(async () => {
  await import('../view');
});
let sequence = 0;
let showModal: jest.Mock;
beforeEach(() => {
  mockId = `trigger-test-${++sequence}`;
  mockState.modals[mockId] = {
    isOpen: false,
    openOnLoad: false,
    animationDuration: 0,
  };
  const dialog = document.createElement('dialog');
  dialog.id = mockId;
  dialog.className = 'wp-block-aggressive-apparel-modal__dialog';
  showModal = jest.fn(() => {
    dialog.open = true;
  });
  dialog.showModal = showModal;
  document.body.append(dialog);
  window.requestAnimationFrame = jest.fn(() => 1);
});
afterEach(() => {
  document.body.innerHTML = '';
  delete mockState.modals[mockId];
});

function trigger(html: string): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const target = holder.firstElementChild as HTMLElement;
  target.classList.add(`modal-trigger-${mockId}`);
  document.body.append(target);
  mockActions.init!();
  return target;
}

it.each([
  '<input>',
  '<input type="checkbox">',
  '<select><option>One</option></select>',
  '<textarea></textarea>',
  '<div contenteditable="true">Edit</div>',
])('leaves an editable trigger candidate alone: %s', html => {
  const field = trigger(html);
  const space = new KeyboardEvent('keydown', {
    key: ' ',
    bubbles: true,
    cancelable: true,
  });
  field.dispatchEvent(space);
  field.click();
  expect(space.defaultPrevented).toBe(false);
  expect(showModal).not.toHaveBeenCalled();
  expect(field.hasAttribute('aria-haspopup')).toBe(false);
});

it('does not intercept fields inside a custom trigger wrapper', () => {
  const wrapper = trigger(
    '<div><input><textarea></textarea><select><option>A</option></select></div>'
  );
  for (const field of wrapper.querySelectorAll<HTMLElement>(
    'input,textarea,select'
  )) {
    const space = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(space);
    field.click();
    expect(space.defaultPrevented).toBe(false);
  }
  expect(showModal).not.toHaveBeenCalled();
});

it.each([
  '<button>Open</button>',
  '<input type="button" value="Open">',
  '<a href="#open">Open</a>',
])('preserves native button activation: %s', html => {
  const control = trigger(html);
  control.click();
  expect(showModal).toHaveBeenCalledTimes(1);
});

it.each(['Enter', ' '])('supports custom button activation with %s', key => {
  const control = trigger('<div>Open</div>');
  control.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  expect(showModal).toHaveBeenCalledTimes(1);
  expect(control.getAttribute('role')).toBe('button');
  expect(control.tabIndex).toBe(0);
});

it('preserves modified, consumed and composing keyboard events', () => {
  const control = trigger('<div>Open</div>');
  for (const options of [
    { ctrlKey: true },
    { isComposing: true },
    { altKey: true },
    { metaKey: true },
  ]) {
    const key = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
      ...options,
    });
    control.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
  }
  const consumed = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
  consumed.preventDefault();
  control.dispatchEvent(consumed);
  expect(showModal).not.toHaveBeenCalled();
});
