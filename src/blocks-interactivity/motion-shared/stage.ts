/** The layout host stays in place; its inner stage clips at viewport edges. */
export const motionContent = (root: Element): Element =>
  root.querySelector<HTMLElement>(
    ':scope > .aa-motion-stage > .aa-motion-content'
  ) ?? root;

export const motionChildren = (root: HTMLElement): HTMLElement[] =>
  Array.from(motionContent(root).children) as HTMLElement[];

export function mountMotionStage(
  root: HTMLElement,
  onMeasure?: () => void
): () => void {
  const stage = root.querySelector<HTMLElement>(':scope > .aa-motion-stage');
  if (!stage) return () => {};
  const content = motionContent(root);
  for (const name of root.classList) {
    if (/^(is-layout-|wp-container-|wp-block-.*-is-layout-)/.test(name))
      content.classList.add(name);
  }
  const view = root.ownerDocument.defaultView!;
  let frame = 0;
  let previous = '';
  const measure = (): void => {
    frame = 0;
    const box = root.getBoundingClientRect();
    const css = view.getComputedStyle(root);
    const left =
      box.left +
      parseFloat(css.borderLeftWidth || '0') +
      parseFloat(css.paddingLeft || '0');
    const right =
      box.right -
      parseFloat(css.borderRightWidth || '0') -
      parseFloat(css.paddingRight || '0');
    const width = root.ownerDocument.documentElement.clientWidth;
    const geometry = `${left}:${right}:${box.height}:${width}`;
    // ResizeObserver reports an initial entry even after our synchronous
    // setup. Re-measuring identical boxes would cancel an entrance in flight.
    if (geometry === previous) return;
    previous = geometry;
    stage.style.setProperty('--aa-motion-left', `${Math.max(0, left)}px`);
    stage.style.setProperty(
      '--aa-motion-right',
      `${Math.max(0, width - right)}px`
    );
    stage.dataset.ready = 'true';
    onMeasure?.();
  };
  const schedule = (): void => {
    if (!frame) frame = view.requestAnimationFrame(measure);
  };
  measure();
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(root);
  // A sibling can change our position without changing our width.
  if (root.parentElement) observer?.observe(root.parentElement);
  view.addEventListener('resize', schedule, { passive: true });
  return () => {
    observer?.disconnect();
    view.removeEventListener('resize', schedule);
    view.cancelAnimationFrame(frame);
    stage.removeAttribute('data-ready');
    stage.style.removeProperty('--aa-motion-left');
    stage.style.removeProperty('--aa-motion-right');
  };
}
