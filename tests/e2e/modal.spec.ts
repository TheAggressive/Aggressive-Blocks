import { test, expect, type Locator, type Page } from '@playwright/test';

async function expectModal(dialog: Locator, modal: boolean): Promise<void> {
  await expect
    .poll(() =>
      dialog.evaluate((element: HTMLDialogElement) => element.matches(':modal'))
    )
    .toBe(modal);
}
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

async function insertModalPage(
  page: Page,
  attrs: Record<string, unknown>,
  extras?: {
    beforeHtml?: string;
    tallContent?: boolean;
    innerHtml?: string[];
    additionalModals?: Array<Record<string, unknown>>;
  }
): Promise<{ id: number; url: string }> {
  await openPageEditor(page);

  await page.evaluate(
    ({
      attrs: modalAttrs,
      beforeHtml,
      tallContent,
      innerHtml,
      additionalModals,
    }) => {
      const { createBlock } = window.wp.blocks;
      const { insertBlocks } = window.wp.data.dispatch('core/block-editor');
      const blocks = [];

      if (beforeHtml) {
        const beforeBlock = createBlock('core/html', { content: beforeHtml });
        blocks.push(beforeBlock);

        // triggerBlockId stores a real editor clientId. Test callers only need
        // to signal that an external trigger is configured; use the inserted
        // block's actual ID so the modal editor does not correctly clear a
        // stale/nonexistent relationship before publish.
        if (modalAttrs.triggerBlockId) {
          modalAttrs.triggerBlockId = beforeBlock.clientId;
        }
      }

      if (tallContent) {
        blocks.push(
          createBlock('core/spacer', { height: '1200px' }),
          createBlock('core/paragraph', { content: 'Scroll depth marker' })
        );
      }

      const inner = (innerHtml?.length ? innerHtml : ['Modal body copy']).map(
        (content: string) => createBlock('core/paragraph', { content })
      );

      blocks.push(createBlock('aggressive-blocks/modal', modalAttrs, inner));

      additionalModals.forEach((additionalAttrs, index) => {
        blocks.push(
          createBlock('aggressive-blocks/modal', additionalAttrs, [
            createBlock('core/paragraph', {
              content: `Additional modal body ${index + 1}`,
            }),
          ])
        );
      });

      if (tallContent) {
        blocks.push(createBlock('core/spacer', { height: '1200px' }));
      }

      insertBlocks(blocks);
    },
    {
      attrs,
      beforeHtml: extras?.beforeHtml ?? '',
      tallContent: extras?.tallContent ?? false,
      innerHtml: extras?.innerHtml ?? [],
      additionalModals: extras?.additionalModals ?? [],
    }
  );

  const expectedModalIds = [
    attrs.modalId,
    ...(extras?.additionalModals ?? []).map(modal => modal.modalId),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  await page.waitForFunction(
    ({ modalIds, expectsExternalTrigger }) => {
      const getBlocks = window.wp.data.select('core/block-editor')?.getBlocks;
      if (!getBlocks) return false;

      interface EditorBlock {
        name: string;
        attributes?: Record<string, unknown>;
        innerBlocks?: EditorBlock[];
      }

      const flatten = (blocks: EditorBlock[]): EditorBlock[] =>
        blocks.flatMap(block => [
          block,
          ...flatten(Array.isArray(block.innerBlocks) ? block.innerBlocks : []),
        ]);
      const modalBlocks = flatten(getBlocks()).filter(
        block => block.name === 'aggressive-blocks/modal'
      );

      return (
        modalIds.every(modalId =>
          modalBlocks.some(block => block.attributes?.modalId === modalId)
        ) &&
        (!expectsExternalTrigger ||
          modalBlocks.some(block => Boolean(block.attributes?.triggerBlockId)))
      );
    },
    {
      modalIds: expectedModalIds,
      expectsExternalTrigger: Boolean(attrs.triggerBlockId),
    }
  );

  return publishAndGetUrl(page);
}

function fireExitIntent(page: Page): Promise<void> {
  return page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent('mouseout', {
        clientY: -1,
        relatedTarget: null,
        bubbles: true,
      })
    );
  });
}

test.describe('Modal — front end', () => {
  let pageIds: number[] = [];
  let modalRuntimeErrors: string[] = [];
  let frontendConsoleErrors: string[] = [];

  test.beforeEach(({ page }) => {
    pageIds = [];
    modalRuntimeErrors = [];
    frontendConsoleErrors = [];
    page.on('pageerror', error => {
      if (!page.url().includes('/wp-admin/')) {
        modalRuntimeErrors.push(`pageerror: ${error.message}`);
      }
    });
    page.on('console', message => {
      if (message.type() === 'error' && !page.url().includes('/wp-admin/')) {
        const error = `console.error: ${message.text()}`;
        frontendConsoleErrors.push(error);
        if (/blocks-interactivity\/modal|\bmodal\b/i.test(message.text())) {
          modalRuntimeErrors.push(error);
        }
      }
    });
    page.on('requestfailed', request => {
      if (
        !request.frame().url().includes('/wp-admin/') &&
        /\/blocks-interactivity\/modal\//.test(request.url())
      ) {
        modalRuntimeErrors.push(
          `requestfailed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`
        );
      }
    });
    page.on('response', response => {
      if (
        response.status() >= 400 &&
        !response.frame().url().includes('/wp-admin/') &&
        /\/blocks-interactivity\/modal\//.test(response.url())
      ) {
        modalRuntimeErrors.push(
          `response: ${response.status()} ${response.url()}`
        );
      }
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (
      frontendConsoleErrors.length > 0 &&
      (modalRuntimeErrors.length > 0 ||
        testInfo.status !== testInfo.expectedStatus)
    ) {
      await testInfo.attach('frontend-console-errors', {
        body: frontendConsoleErrors.join('\n'),
        contentType: 'text/plain',
      });
    }

    if (modalRuntimeErrors.length > 0) {
      await testInfo.attach('modal-runtime-errors', {
        body: modalRuntimeErrors.join('\n'),
        contentType: 'text/plain',
      });
      expect
        .soft(modalRuntimeErrors, 'unexpected modal runtime errors')
        .toEqual([]);
    }

    for (const id of [...pageIds].reverse()) {
      await deletePage(page, id);
    }
    pageIds = [];
  });

  test('opens with correct ARIA, closes via Escape, close button, and backdrop', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-modal',
      triggerLabel: 'Open test modal',
    });
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const dialog = page.locator('#e2e-modal');
    const close = page.locator('.wp-block-aggressive-apparel-modal__close');
    const announcer = page.locator(
      '.wp-block-aggressive-apparel-modal__announcer'
    );

    await expect(shell).toBeHidden();
    await expect(shell).not.toHaveAttribute('open', '');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveAttribute('aria-controls', 'e2e-modal');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    await trigger.click();
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute('open', '');
    await expect(shell).toHaveCSS('position', 'fixed');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expectModal(dialog, true);
    await expect(dialog).toHaveAttribute('aria-labelledby', 'e2e-modal-label');
    await expect(dialog).toHaveAccessibleName('Open test modal');
    await expect(dialog).toBeFocused();
    await expect(page.getByText('Modal body copy')).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate(
          element => getComputedStyle(element, '::backdrop').opacity
        )
      )
      .toBe('0.5');
    await expect(close).toHaveAttribute('aria-label', 'Close modal');
    await expect(announcer).toHaveText('Open test modal');

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();
    await expect(shell).not.toHaveAttribute('open', '');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(shell).toBeVisible();
    await close.click();
    await expect(shell).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(shell).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(shell).toBeHidden();
  });

  test('locks body scroll while open and unlocks on close', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-scroll-lock',
      triggerLabel: 'Open scroll-lock modal',
    });
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');

    await trigger.click();
    await expect(shell).toBeVisible();
    await expectModal(shell, true);

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();
    await expectModal(shell, false);
  });

  test('stays open when reopened during its exit transition', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-reopen',
      triggerLabel: 'Open race modal',
      animationDuration: 1000,
    });
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const close = page.locator('.wp-block-aggressive-apparel-modal__close');

    await trigger.click();
    await expect(shell).toBeVisible();
    await close.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.evaluate(element => (element as HTMLElement).click());

    await expect(shell).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(1250);
    await expect(shell).toBeVisible();
    await expectModal(shell, true);

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();
  });

  test('keeps Tab and Shift+Tab focus off the inert page behind the modal', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(
      page,
      {
        modalId: 'e2e-trap',
        triggerLabel: 'Open trap modal',
      },
      {
        innerHtml: [
          '<a href="#first">First link</a>',
          '<a href="#second">Second link</a>',
        ],
      }
    );
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const dialog = page.locator('#e2e-trap');
    const close = page.locator('.wp-block-aggressive-apparel-modal__close');
    const first = page.getByRole('link', { name: 'First link' });
    const second = page.getByRole('link', { name: 'Second link' });

    await trigger.click();
    await expect(shell).toBeVisible();
    // showModal() focuses the dialog. Wait for that before tabbing.
    await expect(dialog).toBeFocused();

    await close.focus();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(second).toBeFocused();

    // A native modal dialog does not wrap Tab: from the last control, focus
    // may leave the document for browser UI. It must never land on the
    // inert page behind the dialog.
    const focusOutsideDialog = (): Promise<boolean> =>
      page.evaluate(() => {
        const active = document.activeElement;
        return (
          active !== null &&
          active !== document.body &&
          active.closest('dialog[open]') === null
        );
      });
    for (let press = 0; press < 3; press++) {
      await page.keyboard.press('Tab');
      expect(await focusOutsideDialog()).toBe(false);
    }

    await second.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(first).toBeFocused();
    await expect(trigger).not.toBeFocused();
  });

  test('Escape closes only the top-most stacked modal', async ({ page }) => {
    const { id, url } = await insertModalPage(
      page,
      {
        modalId: 'e2e-stack-first',
        triggerLabel: 'Open first modal',
      },
      {
        additionalModals: [
          {
            modalId: 'e2e-stack-second',
            triggerLabel: 'Open second modal',
          },
        ],
      }
    );
    pageIds.push(id);

    await page.goto(url);

    const firstTrigger = page.locator('[aria-controls="e2e-stack-first"]');
    const secondTrigger = page.locator('[aria-controls="e2e-stack-second"]');
    const firstShell = page.locator(
      '.wp-block-aggressive-apparel-modal__shell[data-modal-id="e2e-stack-first"]'
    );
    const secondShell = page.locator(
      '.wp-block-aggressive-apparel-modal__shell[data-modal-id="e2e-stack-second"]'
    );
    const firstDialog = page.locator('#e2e-stack-first');
    const secondDialog = page.locator('#e2e-stack-second');

    await firstTrigger.click();
    await expect(firstShell).toBeVisible();
    await expect(firstDialog).toBeFocused();

    // The first overlay covers the page, so simulate a legitimate second
    // trigger (for example, one located inside modal content).
    await secondTrigger.evaluate(element => (element as HTMLElement).click());
    await expect(secondShell).toBeVisible();
    await expect(secondDialog).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(secondShell).toBeHidden();
    await expect(firstShell).toBeVisible();
    await expect(firstDialog).toBeFocused();
    await expectModal(firstShell, true);

    await page.keyboard.press('Escape');
    await expect(firstShell).toBeHidden();
    await expect(firstTrigger).toBeFocused();
    await expectModal(firstShell, false);
  });

  test('binds external modal-trigger class with ARIA and Space activation', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(
      page,
      {
        modalId: 'e2e-ext',
        triggerBlockId: 'external-html-trigger',
        triggerLabel: 'External modal',
      },
      {
        beforeHtml: [
          '<div class="modal-trigger-e2e-ext"><button type="button">Open via button</button></div>',
          '<a href="#noop" class="modal-trigger-e2e-ext">Open via link</a>',
        ].join(''),
      }
    );
    pageIds.push(id);

    await page.goto(url);

    const button = page.locator('.modal-trigger-e2e-ext button');
    const link = page.locator('a.modal-trigger-e2e-ext');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const builtIn = page.locator('.wp-block-aggressive-apparel-modal__trigger');

    await expect(builtIn).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(button).toHaveAttribute('aria-controls', 'e2e-ext');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(link).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(link).toHaveAttribute('aria-controls', 'e2e-ext');

    await button.click();
    await expect(shell).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(link).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();

    await link.focus();
    await page.keyboard.press('Space');
    await expect(shell).toBeVisible();
    await expect(link).toHaveAttribute('aria-expanded', 'true');
  });

  test('outside close stays in the Tab cycle and dismisses the dialog', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-outside',
      triggerLabel: 'Open outside-close modal',
      closeButtonPlacement: 'outside-top-right',
    });
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const dialog = page.locator('#e2e-outside');
    const close = page.locator(
      '.wp-block-aggressive-apparel-modal__close.close-placement-outside-top-right'
    );

    await trigger.click();
    await expect(shell).toBeVisible();

    // The outside close is positioned outside the panel but stays inside the
    // <dialog>, so it remains in the top layer and not in the inert page.
    await expect(
      dialog.locator(
        '.wp-block-aggressive-apparel-modal__close.close-placement-outside-top-right'
      )
    ).toHaveCount(1);
    await expect(close).toBeVisible();

    await dialog.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();

    await close.click();
    await expect(shell).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('visible close label supplies accessible name without aria-label', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-labeled-close',
      triggerLabel: 'Open labeled-close modal',
      closeButtonLabel: 'Dismiss',
    });
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const close = page.locator('.wp-block-aggressive-apparel-modal__close');

    await trigger.click();
    await expect(close).toContainText('Dismiss');
    await expect(close).not.toHaveAttribute('aria-label');
    await expect(close).toHaveAccessibleName('Dismiss');
  });

  test('disableOverlay removes backdrop dismiss while Escape still works', async ({
    page,
  }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-no-overlay',
      triggerLabel: 'Open no-overlay modal',
      disableOverlay: true,
    });
    pageIds.push(id);

    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');

    await expect(shell).toHaveClass(/is-overlay-disabled/);
    await expect(shell).toHaveAttribute('closedby', 'closerequest');

    await trigger.click();
    await expect(shell).toBeVisible();

    // A backdrop click must not light-dismiss when the overlay is disabled.
    await page.mouse.click(8, 8);
    await expect(shell).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();
  });

  test('openOnLoad opens immediately; openOnLoadOnce skips the second visit', async ({
    page,
  }) => {
    const modalId = 'e2e-onload';
    const { id, url } = await insertModalPage(page, {
      modalId,
      triggerLabel: 'On-load modal',
      openOnLoad: true,
      openOnLoadOnce: true,
    });
    pageIds.push(id);

    // Clear the seen key before page scripts on the first frontend visit.
    // A post-load removeItem races init, which writes the key and makes the
    // following reload skip open. The guard keeps the second visit intact.
    await page.addInitScript(seenId => {
      if (window.top !== window) {
        return;
      }
      const guard = `aa_e2e_cleared_${seenId}`;
      if (sessionStorage.getItem(guard) === '1') {
        return;
      }
      sessionStorage.setItem(guard, '1');
      localStorage.removeItem(`aa_modal_seen_${seenId}`);
    }, modalId);

    await page.goto(url);

    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const builtIn = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const wrapper = page.locator(
      '.wp-block-aggressive-blocks-modal.is-triggerless'
    );
    await expect(builtIn).toHaveCount(0);
    await expect(wrapper).toHaveCSS('display', 'contents');
    expect(
      await wrapper.evaluate(element => element.getBoundingClientRect().height)
    ).toBe(0);
    await expect(shell).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();

    await page.reload();
    await expect(shell).toBeHidden();
  });

  test('opens on scroll depth without a built-in trigger', async ({ page }) => {
    const { id, url } = await insertModalPage(
      page,
      {
        modalId: 'e2e-scroll',
        scrollDepthTrigger: true,
        scrollDepthPercent: 40,
        triggerLabel: 'Scroll modal',
      },
      { tallContent: true }
    );
    pageIds.push(id);

    await page.goto(url);

    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const builtIn = page.locator('.wp-block-aggressive-apparel-modal__trigger');

    await expect(builtIn).toHaveCount(0);
    await expect(shell).toBeHidden();

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });

    await expect(shell).toBeVisible();
    await expect(page.getByText('Modal body copy')).toBeVisible();
  });

  test('scroll depth does not auto-open on a page that cannot scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 2000 });
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-scroll-short',
      scrollDepthTrigger: true,
      scrollDepthPercent: 50,
      triggerLabel: 'Short-page scroll modal',
    });
    pageIds.push(id);

    await page.goto(url);

    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const wrapper = page.locator(
      '.wp-block-aggressive-blocks-modal.is-triggerless'
    );
    await expect(wrapper).toHaveCSS('display', 'contents');
    expect(
      await wrapper.evaluate(element => element.getBoundingClientRect().height)
    ).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight
      )
    ).toBe(true);
    await expect(shell).toBeHidden();

    // Fixture creation leaves Playwright logged in. Remove the admin toolbar
    // when it is present so keyboard order matches the storefront.
    const adminBar = page.locator('#wpadminbar');
    if ((await adminBar.count()) > 0) {
      await adminBar.evaluate(element => element.remove());
    }
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await expect(shell).toBeHidden();
  });

  test('opens on exit-intent mouseout after arming delay', async ({ page }) => {
    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-exit',
      exitIntentTrigger: true,
      exitIntentReshowDays: 7,
      triggerLabel: 'Exit intent modal',
    });
    pageIds.push(id);

    await page.goto(url);
    await page.evaluate(() => {
      localStorage.removeItem('aa_exit_intent_e2e-exit');
    });
    await page.reload();

    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const builtIn = page.locator('.wp-block-aggressive-apparel-modal__trigger');

    await expect(builtIn).toHaveCount(0);
    await expect(shell).toBeHidden();

    await fireExitIntent(page);
    await expect(shell).toBeHidden();

    await page.waitForTimeout(2300);
    await fireExitIntent(page);
    await expect(shell).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();

    // Persistence: dismissed within reshow window — reload should not re-arm.
    await page.reload();
    await page.waitForTimeout(2300);
    await fireExitIntent(page);
    await expect(shell).toBeHidden();
  });

  test('drawer position opens and closes under reduced motion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const { id, url } = await insertModalPage(page, {
      modalId: 'e2e-drawer',
      triggerLabel: 'Open drawer',
      position: 'bottom',
      animationDuration: 300,
    });
    pageIds.push(id);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);

    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    const shell = page.locator('.wp-block-aggressive-apparel-modal__shell');
    const dialog = page.locator('#e2e-drawer');

    await expect(dialog).toHaveClass(/modal-position-bottom/);
    await expect(dialog).toHaveAttribute('data-exit-animation', 'position');

    await trigger.click();
    await expect(shell).toBeVisible();
    await expectModal(shell, true);
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');

    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds?.width).toBeLessThanOrEqual(390);
    expect(
      Math.abs((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0) - 844)
    ).toBeLessThanOrEqual(1);

    await page.keyboard.press('Escape');
    await expect(shell).toBeHidden();
    await expect(trigger).toBeFocused();
    await expectModal(shell, false);
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
  });
});
