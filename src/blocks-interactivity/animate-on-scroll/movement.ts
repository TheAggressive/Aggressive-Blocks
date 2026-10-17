import { motionChildren } from '../motion-shared/stage';

/** Distances start beyond the viewport, or stay inside its available space. */
export function slideTravel(
  left: number,
  right: number,
  width: number,
  distance: number,
  direction: string,
  fit: boolean,
  overshoot = 1
): number {
  const room =
    direction === 'left' ? Math.max(0, width - right) : Math.max(0, left);
  const travel = fit
    ? Math.min(Math.abs(distance), room / overshoot)
    : Math.max(0, direction === 'left' ? width - left : right) +
      Math.abs(distance);
  return direction === 'left' ? travel : -travel;
}

export function measureMovement(root: HTMLElement): void {
  const view = root.ownerDocument.defaultView!;
  const width = root.ownerDocument.documentElement.clientWidth;
  const fit = root.dataset.motionBoundary === 'fit';
  // Measure resting boxes, including while an entrance or exit is running.
  // The attribute is removed synchronously, before a frame can paint.
  root.setAttribute('data-aos-measuring', 'true');
  const children = motionChildren(root);
  const boxes = children.map(child => child.getBoundingClientRect());
  const settings = children.map(child => {
    child.style.removeProperty('--aos-from-transform');
    child.removeAttribute('data-aos-fade-only');
    return view.getComputedStyle(child);
  });
  children.forEach((child, index) => {
    const css = settings[index];
    const number = (name: string, fallback: number): number => {
      const value = parseFloat(
        css.getPropertyValue(`--wp-block-animate-on-scroll-${name}`)
      );
      return Number.isFinite(value) ? value : fallback;
    };
    const type = child.dataset.animateSequenceType ?? root.dataset.animateType;
    const direction =
      child.dataset.animateSequenceDirection ?? root.dataset.animateDirection;
    const box = boxes[index];
    const curve = css
      .getPropertyValue('--wp-block-animate-on-scroll-animation-timing')
      .match(/^cubic-bezier\(([^)]+)\)$/);
    const points = curve ? curve[1].split(',').map(Number) : [0, 0, 1, 1];
    const overshoot = Math.max(
      1,
      points[1],
      points[3],
      1 - points[1],
      1 - points[3]
    );
    if (type === 'slide' && (direction === 'left' || direction === 'right')) {
      child.style.setProperty(
        '--aos-from-transform',
        `translateX(${slideTravel(box.left, box.right, width, number('slide-distance', 50), direction, fit, overshoot)}px)`
      );
    } else if (fit && type === 'zoom' && direction === 'out') {
      const center = (box.left + box.right) / 2;
      const scale = box.width
        ? Math.max(
            1,
            Math.min(
              number('zoom-out-start', 1.5),
              1 +
                Math.max(
                  0,
                  (2 * Math.min(center, width - center)) / box.width - 1
                ) /
                  overshoot
            )
          )
        : 1;
      child.style.setProperty(
        '--aos-from-transform',
        scale > 1 ? `scale(${scale})` : 'none'
      );
    } else if (
      fit &&
      (type === 'rotate' ||
        type === 'flip' ||
        (type === 'bounce' && direction === 'spring'))
    ) {
      const center = (box.left + box.right) / 2;
      const radius = Math.hypot(box.width, box.height) / 2;
      const perspective = number('perspective', 1000);
      const extent =
        type === 'flip'
          ? perspective > radius
            ? radius / (1 - radius / perspective)
            : Infinity
          : type === 'bounce'
            ? (box.width * 1.05) / 2
            : radius;
      if (extent > Math.min(center, width - center))
        child.setAttribute('data-aos-fade-only', 'true');
    }
  });
  root.removeAttribute('data-aos-measuring');
}
