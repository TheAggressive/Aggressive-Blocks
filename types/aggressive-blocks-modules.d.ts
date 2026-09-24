/**
 * Type declarations for plugin script modules resolved via WordPress import maps.
 *
 * These modules are registered with wp_register_script_module() and resolved
 * at runtime by the browser's import map — not by webpack's module resolution.
 */

declare module '@aggressive-blocks/helpers' {
  export function setupFocusTrap(container: HTMLElement): () => void;
}

declare module '@aggressive-blocks/scroll-lock' {
  export function lockScroll(): void;
  export function unlockScroll(): void;
}
