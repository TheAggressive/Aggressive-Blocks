import { test, expect } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

test.describe('Block identity and keyboard regressions', () => {
  let pageId = 0;

  test.beforeEach(async ({ page }) => {
    await page.addLocatorHandler(
      page.getByRole('dialog').filter({
        has: page.getByRole('heading', {
          name: 'Choose a pattern',
          exact: true,
        }),
      }),
      async chooser => {
        await chooser.getByRole('button', { name: /^(Close|Cancel)$/ }).click();
      }
    );
  });
  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('duplicating a modal preserves the original trigger and creates an independent dialog', async ({
    page,
  }) => {
    await openPageEditor(page);
    const modalClientId = await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      const trigger = createBlock('core/button', {
        text: 'Original trigger',
        className: 'modal-trigger-regression-modal',
      });
      const modal = createBlock(
        'aggressive-blocks/modal',
        { modalId: 'regression-modal', triggerBlockId: trigger.clientId },
        [createBlock('core/paragraph', { content: 'Dialog body' })]
      );
      window.wp.data
        .dispatch('core/block-editor')
        .insertBlocks([createBlock('core/buttons', {}, [trigger]), modal]);
      return modal.clientId;
    });
    await expect
      .poll(() =>
        page.evaluate(
          id =>
            window.wp.data.select('core/block-editor').getBlockAttributes(id)
              ?.triggerBlockId,
          modalClientId
        )
      )
      .toBeTruthy();
    await page.evaluate(
      id => window.wp.data.dispatch('core/block-editor').duplicateBlocks([id]),
      modalClientId
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const modals = window.wp.data
            .select('core/block-editor')
            .getBlocks()
            .filter(
              (block: { name: string }) =>
                block.name === 'aggressive-blocks/modal'
            );
          return (
            modals.length === 2 &&
            modals[0].attributes.modalId === 'regression-modal' &&
            modals[1].attributes.modalId !== 'regression-modal' &&
            !!modals[1].attributes.modalId &&
            !modals[1].attributes.triggerBlockId &&
            !modals[1].attributes.triggerBlockKey
          );
        })
      )
      .toBe(true);
    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.goto(url);
    const dialogs = page.locator(
      'dialog.wp-block-aggressive-apparel-modal__dialog'
    );
    await expect(dialogs).toHaveCount(2);
    const ids = await dialogs.evaluateAll(elements =>
      elements.map(element => element.id)
    );
    expect(new Set(ids).size).toBe(2);
    await page.getByRole('button', { name: 'Original trigger' }).click();
    await expect(dialogs.nth(0)).toBeVisible();
    await expect(dialogs.nth(1)).not.toBeVisible();
    await dialogs
      .nth(0)
      .locator('[data-wp-on--click="actions.closeModal"]')
      .click();
    await expect(dialogs.nth(0)).not.toBeVisible();
    await page.locator(`[aria-controls="${ids[1]}"]`).click();
    await expect(dialogs.nth(1)).toBeVisible();
    await expect(dialogs.nth(0)).not.toBeVisible();
  });

  test('ticker has one server identity and mirrors live content to every decorative copy', async ({
    page,
  }) => {
    await openPageEditor(page);
    await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      window.wp.data.dispatch('core/block-editor').insertBlock(
        createBlock('aggressive-blocks/ticker', {}, [
          createBlock('core/paragraph', {
            anchor: 'ticker-regression-anchor',
            content: 'Live price',
          }),
        ])
      );
    });
    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    const response = await page.request.get(url);
    expect(
      (await response.text()).match(/id="ticker-regression-anchor"/g)
    ).toHaveLength(1);
    await page.goto(url);
    const copies = page.locator('.ticker__content');
    await expect.poll(() => copies.count()).toBeGreaterThan(2);
    await copies
      .first()
      .locator('p')
      .evaluate(element => {
        element.textContent = 'Updated price';
        element.setAttribute('data-live-update', 'yes');
      });
    await expect
      .poll(() =>
        copies.evaluateAll(elements =>
          elements.every(
            element =>
              element.querySelector('[data-live-update="yes"]')?.textContent ===
              'Updated price'
          )
        )
      )
      .toBe(true);
    await expect(page.locator('#ticker-regression-anchor')).toHaveCount(1);
    await expect(copies.nth(1).locator('[data-wp-interactive]')).toHaveCount(0);
  });

  test(
    'carousel retains link focus and respects widget keys and browser shortcuts',
    { tag: '@webkit' },
    async ({ page }) => {
      await openPageEditor(page);
      await page.evaluate(() => {
        const { createBlock } = window.wp.blocks;
        const slides = ['One', 'Two'].map(label =>
          createBlock('core/cover', { minHeight: 320, dimRatio: 0 }, [
            createBlock('core/paragraph', {
              content: `<a href="#example">Slide ${label}</a>`,
            }),
          ])
        );
        window.wp.data
          .dispatch('core/block-editor')
          .insertBlock(
            createBlock(
              'aggressive-blocks/hero-carousel',
              { transition: 'fade', autoplay: false },
              slides
            )
          );
      });
      const { id, url } = await publishAndGetUrl(page);
      pageId = id;
      await page.goto(url);
      const root = page.locator('.aa-hero').first();
      const slides = root.locator('.aa-hero__slide');
      const link = slides.first().getByRole('link');
      await link.focus();
      // Synthetic shortcuts avoid invoking the browser's actual Back command.
      const prevented = await link.evaluate(element => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          altKey: true,
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(prevented).toBe(false);
      await expect(slides.first()).toHaveClass(/is-active/);
      await slides.first().evaluate(element => {
        const slider = document.createElement('div');
        slider.setAttribute('role', 'slider');
        slider.tabIndex = 0;
        slider.textContent = 'Widget';
        element.appendChild(slider);
      });
      await page.getByRole('slider').focus();
      await page.keyboard.press('ArrowRight');
      await expect(slides.first()).toHaveClass(/is-active/);
      await link.focus();
      await page.keyboard.press('ArrowRight');
      await expect(slides.nth(1)).toHaveClass(/is-active/);
      await expect(slides.nth(1)).toBeFocused();
    }
  );
  test('carousel pauses hidden background videos and honors its playback control', async ({
    page,
  }) => {
    await openPageEditor(page);
    const encodedVideo = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.start();
      const context = canvas.getContext('2d')!;
      for (let frame = 0; frame < 5; frame++) {
        context.fillStyle = frame % 2 ? 'red' : 'blue';
        context.fillRect(0, 0, 32, 32);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await new Promise<void>(resolve => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      stream.getTracks().forEach(track => track.stop());
      return new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
      });
    });
    await page.route('**/hero-regression.webm', route =>
      route.fulfill({
        contentType: 'video/webm',
        body: Buffer.from(encodedVideo, 'base64'),
      })
    );
    await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      const slides = ['One', 'Two'].map(label =>
        createBlock(
          'core/cover',
          {
            backgroundType: 'video',
            url: `${location.origin}/hero-regression.webm`,
            minHeight: 320,
            dimRatio: 0,
          },
          [createBlock('core/paragraph', { content: label })]
        )
      );
      window.wp.data.dispatch('core/block-editor').insertBlocks([
        createBlock(
          'aggressive-blocks/hero-carousel',
          {
            transition: 'fade',
            autoplay: true,
            autoplaySpeed: 60000,
            pauseOnHover: false,
          },
          slides
        ),
        createBlock('core/spacer', { height: '2000px' }),
      ]);
    });
    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.goto(url);
    const root = page.locator('.aa-hero').first();
    await root.scrollIntoViewIfNeeded();
    const videos = root.locator('video');
    await expect(videos).toHaveCount(2);
    const paused = () =>
      videos.evaluateAll(elements =>
        elements.map(element => (element as HTMLVideoElement).paused)
      );
    await expect.poll(paused).toEqual([false, true]);
    await root
      .locator('[data-wp-on--click="actions.togglePlay"]')
      .evaluate((element: HTMLElement) => element.click());
    await expect.poll(paused).toEqual([true, true]);
    await root
      .locator('[data-wp-on--click="actions.togglePlay"]')
      .evaluate((element: HTMLElement) => element.click());
    await expect.poll(paused).toEqual([false, true]);
    await root
      .locator('[data-wp-on--click="actions.next"]')
      .first()
      .evaluate((element: HTMLElement) => element.click());
    await expect.poll(paused).toEqual([true, false]);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(paused).toEqual([true, true]);
  });
});
