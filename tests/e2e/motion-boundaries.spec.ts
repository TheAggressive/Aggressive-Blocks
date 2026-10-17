import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import ts from 'typescript';

const source = (name: string): string =>
  fs.readFileSync(
    new URL(`../../src/blocks-interactivity/${name}`, import.meta.url),
    'utf8'
  );
const script =
  ['motion-shared/stage.ts', 'animate-on-scroll/movement.ts']
    .map(name =>
      ts
        .transpileModule(source(name), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        })
        .outputText.replace(/^import .*;$/gm, '')
        .replace(/\bexport /g, '')
    )
    .join('\n') +
  '\nwindow.prepareMotion = root => mountMotionStage(root, () => measureMovement(root)); window.prepareStage = mountMotionStage;';
const css = fs.readFileSync(
  new URL(
    '../../build/blocks-interactivity/animate-on-scroll/style-index.css',
    import.meta.url
  ),
  'utf8'
);
const root = (
  id = 'motion',
  children = '<div class="card">Motion content</div>'
): string =>
  `<section id="${id}" class="wp-block-animate-on-scroll is-visible" data-wp-interactive="" data-animate-id="test" data-animate-type="slide" data-animate-direction="left" data-motion-boundary="viewport"><div class="aa-motion-stage"><div class="aa-motion-content">${children}</div></div></section>`;

test.describe('Viewport motion boundaries', { tag: '@webkit' }, () => {
  test('Card Flip perspective never widens the page during either half of a flip', async ({
    page,
  }) => {
    const cardCss = fs.readFileSync(
      new URL(
        '../../build/blocks-interactivity/card-flip/style-index.css',
        import.meta.url
      ),
      'utf8'
    );
    for (const width of [375, 1440]) {
      await page.goto('about:blank');
      await page.setViewportSize({ width, height: 720 });
      await page.setContent(
        '<style>body{margin:0}</style><div class="aa-card-flip"><div class="aa-motion-stage"><div class="aa-motion-content"><button class="aa-card-flip__toggle">Flip</button><div class="aa-card-flip__inner"><div class="aa-card-flip__face" style="height:200px">Front</div><div class="aa-card-flip__face aa-card-flip__face--back">Back</div></div></div></div></div>'
      );
      await page.addStyleTag({ content: cardCss });
      await page.addScriptTag({ content: script });
      await page
        .locator('.aa-card-flip')
        .evaluate(el =>
          (
            window as unknown as { prepareStage: (root: HTMLElement) => void }
          ).prepareStage(el as HTMLElement)
        );
      for (const angle of [0, 37, 90, 143, 180]) {
        await page.locator('.aa-card-flip__inner').evaluate((el, angle) => {
          const inner = el as HTMLElement;
          inner.style.transition = 'none';
          inner.style.transform = `rotateY(${angle}deg)`;
        }, angle);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBe(width);
      }
    }
  });
  for (const layout of ['constrained', 'columns', 'full', 'nested', 'rtl']) {
    test(`offscreen entrances preserve ${layout} layout and clip only at screen edges`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const markup = layout === 'nested' ? root('outer', root()) : root();
      await page.setContent(
        `<style>body{margin:0}.layout{width:600px;margin:0 auto}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%}.full{width:100%}.card{height:80px;background:rgb(0,100,200);box-shadow:0 0 12px red}#motion{--wp-block-animate-on-scroll-animation-duration:1s;--wp-block-animate-on-scroll-animation-timing:linear}</style><main class="layout ${layout}" dir="${layout === 'rtl' ? 'rtl' : 'ltr'}">${layout === 'columns' ? '<button id="neighbor" onclick="this.dataset.clicked=1">Column one</button>' : ''}${markup}</main>`
      );
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: script });
      const before = await page.locator('#motion .card').evaluate(el => ({
        left: el.getBoundingClientRect().left,
        width: el.getBoundingClientRect().width,
      }));
      await page.evaluate(() => {
        document
          .querySelectorAll<HTMLElement>('.wp-block-animate-on-scroll')
          .forEach(root => {
            if (root.id === 'outer') root.dataset.animateType = 'fade';
            (
              window as unknown as {
                prepareMotion: (root: HTMLElement) => void;
              }
            ).prepareMotion(root);
          });
      });
      const after = await page.locator('#motion .card').evaluate(el => ({
        left: el.getBoundingClientRect().left,
        width: el.getBoundingClientRect().width,
      }));
      expect(after.left).toBeCloseTo(before.left, 1);
      expect(after.width).toBeCloseTo(before.width, 1);
      if (layout === 'columns') {
        await page.locator('#neighbor').click();
        await expect(page.locator('#neighbor')).toHaveAttribute(
          'data-clicked',
          '1'
        );
      }
      await page.locator('#motion').evaluate(el => {
        el.setAttribute('data-aos-preparing', 'true');
        el.classList.remove('is-visible');
        el.querySelector('.card')!.getBoundingClientRect();
        el.removeAttribute('data-aos-preparing');
      });
      expect(
        await page
          .locator('#motion .card')
          .evaluate(el => el.getBoundingClientRect().left)
      ).toBeGreaterThanOrEqual(1280);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBe(1280);
      await page
        .locator('#motion')
        .evaluate(el => el.classList.add('is-visible'));
      await page.waitForTimeout(30);
      await page.locator('#motion .card').evaluate(el =>
        el.getAnimations().forEach(animation => {
          animation.pause();
          animation.currentTime = 500;
        })
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBe(1280);
      if (layout === 'constrained' || layout === 'nested') {
        await expect
          .poll(() =>
            page.evaluate(() => document.elementFromPoint(1100, 40)?.className)
          )
          .toBe('card');
      }
      await page.setViewportSize({ width: 800, height: 720 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(800);
      expect(
        await page.evaluate(() => getComputedStyle(document.body).overflowX)
      ).toBe('visible');
    });
  }

  test('fit mode keeps slides inside the screen and fades full-width rotation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 720 });
    await page.setContent(
      `<style>body{margin:0}.card{height:80px}</style>${root()}`
    );
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
    await page.locator('#motion').evaluate(el => {
      const root = el as HTMLElement;
      root.dataset.motionBoundary = 'fit';
      (
        window as unknown as { prepareMotion: (root: HTMLElement) => void }
      ).prepareMotion(root);
      root.setAttribute('data-aos-preparing', 'true');
      root.classList.remove('is-visible');
    });
    expect(
      await page
        .locator('.card')
        .evaluate(el => el.getBoundingClientRect().left)
    ).toBe(0);
    await page.locator('#motion').evaluate(el => {
      (el as HTMLElement).dataset.animateType = 'rotate';
      (el as HTMLElement).dataset.animateDirection = 'left';
      (
        window as unknown as { prepareMotion: (root: HTMLElement) => void }
      ).prepareMotion(el as HTMLElement);
    });
    await expect(page.locator('.card')).toHaveAttribute(
      'data-aos-fade-only',
      'true'
    );
    await expect(page.locator('.card')).toHaveCSS('transform', 'none');
    for (const [type, direction] of [
      ['flip', 'right'],
      ['bounce', 'spring'],
    ]) {
      await page.locator('#motion').evaluate(
        (el, [type, direction]) => {
          const root = el as HTMLElement;
          root.dataset.animateType = type;
          root.dataset.animateDirection = direction;
          (
            window as unknown as { prepareMotion: (root: HTMLElement) => void }
          ).prepareMotion(root);
          root.removeAttribute('data-aos-preparing');
          root.classList.add('is-visible');
        },
        [type, direction]
      );
      await expect(page.locator('.card')).toHaveAttribute(
        'data-aos-fade-only',
        'true'
      );
      await expect(page.locator('.card')).toHaveCSS('animation-name', 'none');
    }
  });
});
