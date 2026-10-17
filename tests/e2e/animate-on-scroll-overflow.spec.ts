import { test, expect } from '@playwright/test';
import { readAnimationAsset } from './animation-assets';

const effects = [
  ['slide', 'left'],
  ['slide', 'right'],
  ['zoom', 'out'],
  ['rotate', 'left'],
  ['flip', 'right'],
  ['bounce', 'spring'],
];

// Isolated full-width fixtures expose overflow that a theme's page padding
// or global overflow rule could otherwise hide. Exercise the shipped CSS.
for (const width of [375, 1440]) {
  test(`animations keep the page width at ${width}px @webkit`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent('<style>body { margin: 0; }</style>');
    await page.addStyleTag({
      content: await readAnimationAsset(page, baseURL, 'style-index.css'),
    });

    for (const sequence of [false, true]) {
      for (const [effect, direction] of effects) {
        await test.step(`${sequence ? 'sequence' : 'single'} ${effect} ${direction}`, async () => {
          const measurements = await page.evaluate(
            ({ effect, direction, sequence }) => {
              const root = document.createElement('div');
              root.className = 'wp-block-animate-on-scroll';
              root.setAttribute('data-wp-interactive', 'test');
              if (sequence) {
                root.classList.add('has-animation-sequence');
              } else {
                root.dataset.animateType = effect;
                root.dataset.animateDirection = direction;
              }
              root.dataset.staggerChildren = 'true';
              root.style.setProperty(
                '--wp-block-animate-on-scroll-animation-duration',
                '1s'
              );
              const stage = document.createElement('div');
              stage.className = 'aa-motion-stage';
              stage.dataset.ready = 'true';
              const content = document.createElement('div');
              content.className = 'aa-motion-content';
              stage.append(content);
              root.append(stage);
              for (let i = 0; i < 2; i++) {
                const child = document.createElement('div');
                child.style.height = '200px';
                child.style.setProperty(
                  '--wp-block-animate-on-scroll-stagger-delay',
                  `${i * 0.1}s`
                );
                if (sequence) {
                  child.dataset.animateSequenceType = effect;
                  child.dataset.animateSequenceDirection = direction;
                }
                content.append(child);
              }
              document.body.replaceChildren(root);

              const measure = () => ({
                pageWidth: document.documentElement.scrollWidth,
                overflowY: getComputedStyle(root).overflowY,
              });
              const seek = (progress: number) => {
                // Force style resolution so transitions exist before seeking.
                getComputedStyle(content.firstElementChild!).transform;
                for (const animation of root.getAnimations({ subtree: true })) {
                  animation.pause();
                  const timing = animation.effect!.getComputedTiming();
                  animation.currentTime =
                    Number(timing.delay) + Number(timing.duration) * progress;
                }
              };
              const result = [measure()]; // First paint, before hydration.
              seek(1);
              root.dataset.animateId = 'overflow-test';
              seek(1);
              result.push(measure()); // Armed and hidden.
              root.classList.add('is-visible');
              seek(0.5);
              result.push(measure()); // Mid-entrance, including stagger.
              seek(1);
              result.push(measure()); // Visible.
              root.classList.remove('is-visible');
              root.classList.add('is-exiting');
              seek(0.5);
              result.push(measure()); // Mid-exit.
              seek(1);
              result.push(measure()); // Hidden after exit.
              root.scrollLeft = 100;
              return { states: result, scrollLeft: root.scrollLeft };
            },
            { effect, direction, sequence }
          );

          for (const state of measurements.states) {
            expect(state.pageWidth).toBe(width);
            expect(state.overflowY).toBe('visible');
          }
          expect(measurements.scrollLeft).toBe(0);
        });
      }
    }
  });
}
