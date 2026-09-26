import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

/**
 * Publish a page with one card whose back face holds a link, and open it.
 * Returns the page id so the caller can clean it up.
 */
async function publishCard(
  page: Page,
  flipOn: 'hover' | 'click'
): Promise<number> {
  await openPageEditor(page);

  await page.evaluate(async mode => {
    const { createBlock } = window.wp.blocks;
    const front = createBlock('aggressive-blocks/card-flip-front', {}, [
      createBlock('core/paragraph', { content: 'FRONT' }),
    ]);
    const back = createBlock('aggressive-blocks/card-flip-back', {}, [
      createBlock('core/paragraph', {
        content: '<a href="https://example.com">BACK LINK</a>',
      }),
    ]);
    const card = createBlock('aggressive-blocks/card-flip', { flipOn: mode }, [
      front,
      back,
    ]);
    window.wp.data.dispatch('core/block-editor').insertBlock(card);
    await new Promise(r => setTimeout(r, 400));
  }, flipOn);

  const { id, url } = await publishAndGetUrl(page);
  await page.goto(url);
  await page.locator('.aa-card-flip').first().waitFor();
  return id;
}

function cardParts(page: Page) {
  const card = page.locator('.aa-card-flip').first();
  return {
    card,
    inner: card.locator('.aa-card-flip__inner'),
    front: card.locator('.aa-card-flip__face--front'),
    back: card.locator('.aa-card-flip__face--back'),
    toggle: card.locator('.aa-card-flip__toggle'),
  };
}

test.describe('Card Flip — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('flips on click with correct inert + aria-pressed a11y', async ({
    page,
  }) => {
    pageId = await publishCard(page, 'click');
    const { card, front, back, toggle } = cardParts(page);

    // Initial: back is inert (out of the tab order), front is not.
    await expect(front).not.toHaveAttribute('inert', /.*/);
    await expect(back).toHaveAttribute('inert', /.*/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // Flip.
    await toggle.click();
    await expect(card).toHaveClass(/is-flipped/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(back).not.toHaveAttribute('inert', /.*/);
    await expect(front).toHaveAttribute('inert', /.*/);

    // Keyboard toggle back.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(card).not.toHaveClass(/is-flipped/);
    await expect(back).toHaveAttribute('inert', /.*/);
  });

  test('Escape turns the card back and keeps focus on the flip control', async ({
    page,
  }) => {
    pageId = await publishCard(page, 'click');
    const { card, back, toggle } = cardParts(page);

    await toggle.click();
    // The flip lifts `inert` from the back face a moment after the click, and
    // focus() on an inert element is silently ignored. Wait before focusing.
    await expect(back).not.toHaveAttribute('inert', /.*/);
    const link = back.getByRole('link', { name: 'BACK LINK' });
    await link.focus();
    await expect(link).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(card).not.toHaveClass(/is-flipped/);
    await expect(back).toHaveAttribute('inert', /.*/);
    await expect(toggle).toBeFocused();
  });

  test('hover flip keeps the visible face, inert and aria-pressed in step', async ({
    page,
  }) => {
    pageId = await publishCard(page, 'hover');
    const { card, inner, front, back, toggle } = cardParts(page);

    await card.hover();
    await expect(card).toHaveClass(/is-flipped/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(back).not.toHaveAttribute('inert', /.*/);

    // Clicking the control while hovered turns the card back for real: the
    // front shows (no leftover :hover rotation) and is the face left open.
    await toggle.click();
    await expect(card).not.toHaveClass(/is-flipped/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(front).not.toHaveAttribute('inert', /.*/);
    await expect(back).toHaveAttribute('inert', /.*/);
    await expect
      .poll(() => inner.evaluate(el => getComputedStyle(el).transform))
      .toBe('none');

    // Leaving and re-entering flips it again.
    await page.mouse.move(0, 0);
    await card.hover();
    await expect(card).toHaveClass(/is-flipped/);
    await expect(back.getByRole('link', { name: 'BACK LINK' })).toBeVisible();
  });
});

test.describe('Card Flip — touch', () => {
  test.use({ hasTouch: true });

  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('tapping the control on a hover card flips it once', async ({
    page,
  }) => {
    pageId = await publishCard(page, 'hover');
    const { card, back, toggle } = cardParts(page);

    await toggle.tap();
    await expect(card).toHaveClass(/is-flipped/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(back).not.toHaveAttribute('inert', /.*/);

    await toggle.tap();
    await expect(card).not.toHaveClass(/is-flipped/);
    await expect(back).toHaveAttribute('inert', /.*/);
  });
});
