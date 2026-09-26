import { InnerBlocks } from '@wordpress/block-editor';

/**
 * Save function for the modal block.
 *
 * Only the inner blocks are stored. render.php builds the wrapper, trigger,
 * dialog, and close button, and applies the color, border, padding, and
 * shadow supports to the dialog panel alone.
 *
 * @return Element to render.
 */
export default function save(): JSX.Element {
  return <InnerBlocks.Content />;
}
