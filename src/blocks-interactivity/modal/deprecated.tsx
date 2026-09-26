/**
 * Modal block deprecations.
 *
 * @module src/blocks-interactivity/modal/deprecated
 */

import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
import type { BlockConfiguration } from '@wordpress/blocks';
import { __ } from '@wordpress/i18n';

import metadata from './block.json';
import type { ModalAttributes } from './types';
import { migrateLegacyDesign } from './utils/migrateLegacyDesign';

type Deprecation = NonNullable<
  BlockConfiguration<ModalAttributes>['deprecated']
>[number];

/**
 * Supports before v3. Block supports were serialized onto the saved wrapper,
 * so validating that markup needs them serialized again.
 */
const legacySupports = {
  interactivity: true,
  html: false,
  align: true,
  spacing: { margin: true, padding: true },
  __experimentalBorder: {
    color: true,
    radius: true,
    style: true,
    width: true,
  },
  shadow: true,
  color: { background: true, text: true },
};

const legacyAttributes = {
  ...metadata.attributes,
  dialogPadding: { type: 'string', default: '' },
  dialogBorderRadius: { type: 'string', default: '' },
} as unknown as NonNullable<BlockConfiguration<ModalAttributes>['attributes']>;

const migrate = (attributes: Record<string, unknown>) =>
  migrateLegacyDesign(attributes) as ModalAttributes;

/**
 * v2 — inner blocks saved inside a copy of the block wrapper. render.php put
 * that copy in the dialog body, so its colors, border, padding, and margin
 * styled the content a second time.
 */
const v2: Deprecation = {
  attributes: legacyAttributes,
  supports: legacySupports,
  migrate,
  save() {
    return (
      <div {...useBlockProps.save()}>
        <InnerBlocks.Content />
      </div>
    );
  },
};

/**
 * v1 — the close button was also saved in the post content. render.php now
 * renders it, so placement and styling change without new deprecations.
 */
const v1: Deprecation = {
  attributes: legacyAttributes,
  supports: legacySupports,
  migrate,
  save() {
    return (
      <div {...useBlockProps.save()}>
        <button
          className='wp-block-aggressive-apparel-modal__close'
          type='button'
          data-wp-on--click='actions.closeModal'
          aria-label={__('Close modal', 'aggressive-blocks')}
        >
          &#x2715;
        </button>
        <InnerBlocks.Content />
      </div>
    );
  },
};

export default [v2, v1];
