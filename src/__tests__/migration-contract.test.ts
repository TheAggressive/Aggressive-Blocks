/**
 * Source metadata contracts that prevent extraction drift.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

function readBlock(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
}

const expected = {
  'src/blocks-interactivity/animate-on-scroll/block.json':
    'aggressive-blocks/animate-on-scroll',
  'src/blocks-interactivity/parallax/block.json': 'aggressive-blocks/parallax',
  'src/blocks-interactivity/modal/block.json': 'aggressive-blocks/modal',
  'src/blocks-interactivity/card-flip/block.json':
    'aggressive-blocks/card-flip',
  'src/blocks-interactivity/card-flip-front/block.json':
    'aggressive-blocks/card-flip-front',
  'src/blocks-interactivity/card-flip-back/block.json':
    'aggressive-blocks/card-flip-back',
  'src/blocks-interactivity/horizontal-scroll/block.json':
    'aggressive-blocks/horizontal-scroll',
  'src/blocks-interactivity/hero-carousel/block.json':
    'aggressive-blocks/hero-carousel',
  'src/blocks-interactivity/ticker/block.json': 'aggressive-blocks/ticker',
  'src/blocks/split-story/block.json': 'aggressive-blocks/split-story',
  'src/blocks/split-story-media/block.json':
    'aggressive-blocks/split-story-media',
  'src/blocks/split-story-content/block.json':
    'aggressive-blocks/split-story-content',
  'src/blocks/copyright/block.json': 'aggressive-blocks/copyright',
} as const;

describe('migrated block metadata', () => {
  it.each(Object.entries(expected))(
    '%s keeps the plugin namespace and text domain',
    (relative, name) => {
      const data = readBlock(relative);
      expect(data.name).toBe(name);
      expect(data.category).toBe('aggressive-apparel');
      expect(data.textdomain).toBe('aggressive-blocks');
    }
  );

  it('keeps parent and allowedBlocks contracts', () => {
    expect(
      readBlock('src/blocks-interactivity/card-flip/block.json').allowedBlocks
    ).toEqual([
      'aggressive-blocks/card-flip-front',
      'aggressive-blocks/card-flip-back',
    ]);
    expect(
      readBlock('src/blocks-interactivity/card-flip-front/block.json').parent
    ).toEqual(['aggressive-blocks/card-flip']);
    expect(
      readBlock('src/blocks-interactivity/hero-carousel/block.json')
        .allowedBlocks
    ).toEqual(['core/cover']);
    expect(
      readBlock('src/blocks/split-story/block.json').allowedBlocks
    ).toEqual([
      'aggressive-blocks/split-story-media',
      'aggressive-blocks/split-story-content',
    ]);
  });

  it('opens the modal with the native dialog instead of a custom trap', () => {
    const modal = readFileSync(
      path.join(root, 'src/blocks-interactivity/modal/view.ts'),
      'utf8'
    );
    expect(modal).toContain('showModal()');
    expect(modal).not.toContain("from '@aggressive-blocks/scroll-lock'");
    expect(modal).not.toContain("from '@aggressive-blocks/helpers'");
  });
});
