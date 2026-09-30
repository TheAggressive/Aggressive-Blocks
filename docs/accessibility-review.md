# Manual accessibility review

CI runs axe (WCAG 2.x A and AA) on every block and checks keyboard, focus, `inert`, and reduced-motion behavior in Playwright. Automated tools still miss what only a person can judge: whether announcements make sense, whether the reading order matches the page, and whether controls work with a real screen reader's navigation modes. Do this pass before a major release, or after a change to a block's markup or keyboard handling. It takes about 30 minutes.

## Setup

Build one page that uses every block, with real content: a Hero Carousel of three slides with autoplay on, a Ticker, Animate On Scroll, Parallax, a Card Flip with a link on its back face, a Split Story, a Horizontal Scroll of three panels, a Modal whose content includes a link, and a Copyright line. Publish it, then log out.

Run the pass in at least one of these pairs, and both before a major release:

* **VoiceOver + Safari** on macOS: <kbd>Cmd</kbd>+<kbd>F5</kbd> starts VoiceOver. <kbd>VO</kbd> is <kbd>Ctrl</kbd>+<kbd>Option</kbd>.
* **NVDA + Firefox or Chrome** on Windows: NVDA is free from nvaccess.org. <kbd>Insert</kbd> is the NVDA key.

For each block, move through it three ways: <kbd>Tab</kbd> only, the screen reader's reading keys (<kbd>VO</kbd>+<kbd>→</kbd> or NVDA's <kbd>↓</kbd>), and its quick navigation (headings, buttons, landmarks). Note anything that is silent, announced twice, announced out of order, or unclear.

## Per block

### Hero Carousel

- [ ] The region is announced as "Hero slideshow", and each slide as "slide", "Slide 1 of 3".
- [ ] Autoplay stops as soon as keyboard or screen-reader focus enters the carousel, and stays stopped while focus is inside. The controls follow the slides in tab order, so this is what keeps a slide from changing while someone reads it.
- [ ] "Pause slideshow" stops autoplay for good, and then says "Play slideshow".
- [ ] While autoplay runs, the screen reader does not interrupt with every slide change. The live region is polite, and it should stay quiet until someone moves the carousel.
- [ ] "Previous slide" and "Next slide" announce the new slide ("2 of 3"). The dot group is announced as "Choose slide", and the current dot as current.
- [ ] Only the visible slide's links and buttons are reachable. Hidden slides can't be tabbed into.

### Ticker

- [ ] The pause control is announced as a toggle button, "Pause animation", not pressed. After activating it: "Play animation", pressed.
- [ ] Each message is read once. The duplicated copies the loop uses for the seamless scroll are skipped.

### Animate On Scroll and Parallax

- [ ] Content is read in page order, and nothing is skipped because it has not animated in yet. Read the page from the top without scrolling first.
- [ ] With the OS set to reduce motion (macOS **Accessibility → Display → Reduce motion**, Windows **Accessibility → Visual effects → Animation effects** off), content appears without movement.

### Card Flip

- [ ] The control is announced as "Flip card", toggle button, not pressed. After activating it: pressed.
- [ ] Before flipping, the back face's link can't be reached by <kbd>Tab</kbd> or by reading. After flipping, it can, and the front face's content can't.
- [ ] <kbd>Escape</kbd> on the back face turns the card back and leaves focus on "Flip card".

### Split Story

- [ ] The reading order is the media column, then the content column, and it matches the visual order at every width.
- [ ] The sticky media column never covers the text being read or the focused element when tabbing down the content column.

### Horizontal Scroll

- [ ] The gallery is announced with its label and as a carousel. The progress bar is announced as "Scroll progress" with a value.
- [ ] "Previous slide" and "Next slide" appear when focused, even though they are visually hidden at rest, and each press announces the new position ("2 of 3").
- [ ] Tabbing into a panel's content scrolls that panel into view. Focus is never on something offscreen.

### Modal

- [ ] The trigger is announced as a button that opens a dialog.
- [ ] Opening it moves focus into the dialog, and its heading is read as the dialog's name.
- [ ] <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> stay inside the dialog, and the screen reader's reading keys can't reach the page behind it.
- [ ] "Close modal", <kbd>Escape</kbd>, and a click on the backdrop each close it, and focus returns to the trigger.

### Copyright

- [ ] The © symbol and year read naturally, for example "copyright 2026 Aggressive Apparel".

## Whole page

- [ ] **Keyboard only.** With the mouse and screen reader off, every control is reachable and usable, the focus ring is visible on every stop, and there is no keyboard trap outside the open Modal.
- [ ] **Zoom and reflow.** At 200% browser zoom, and at a 320 px wide window (400% on a 1280 px screen), nothing overlaps or is cut off, and there is no horizontal scrolling except inside Horizontal Scroll.
- [ ] **Forced colors.** In Windows High Contrast (**Accessibility → Contrast themes**), every control and its focus ring stays visible, and the Card Flip and Modal still show which state they are in.
- [ ] **Text spacing.** With increased line, letter, and word spacing (for example the "Text Spacing" bookmarklet), no text is clipped or overlaps.

## Recording results

Put the date, the screen reader, browser, and OS versions, and every failed check in the release PR. File each failure as an issue with the block's name, the steps, what was announced, and what was expected. A pass with no failures still gets recorded, so the next review knows what was covered and when.
