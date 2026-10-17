/**
 * PresetPicker — shared "Quick Presets" tile grid for block inspectors.
 *
 * Used by the Parallax and Animate On Scroll blocks so both present the
 * same UI: a 2-column grid of name-only tiles (descriptions in
 * tooltips), native pressed styling + check on the preset matching the current
 * settings, and an optional quiet Reset link in the header.
 *
 * Styles live in editor-shared/editor.css (imported by each block's
 * editor.css). This UI renders in the editor chrome (sidebar), so it
 * uses WordPress admin component conventions, not theme tokens.
 *
 * @package Aggressive Apparel
 */

import { BaseControl, Button } from '@wordpress/components';
import { Stack } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { check } from '@wordpress/icons';

export interface PresetTile<T> {
  key: string;
  name: string;
  /** Shown as a tooltip on the tile. */
  description?: string;
  /** The attribute/settings patch this preset applies. */
  value: T;
}

interface PresetPickerProps<T> {
  /** Header label; defaults to "Quick Presets". */
  label?: string;
  presets: Array<PresetTile<T>>;
  /** Key of the preset matching current settings (see preset-match.ts). */
  activeKey?: string | null;
  onApply: (preset: PresetTile<T>) => void;
  /** Renders a quiet Reset link in the header when provided. */
  onReset?: () => void;
}

export function PresetPicker<T>({
  label = __('Quick Presets', 'aggressive-blocks'),
  presets,
  activeKey = null,
  onApply,
  onReset,
}: PresetPickerProps<T>) {
  return (
    <Stack direction='column' gap='sm' className='aa-preset-picker'>
      <Stack direction='row' align='center' justify='space-between'>
        <BaseControl.VisualLabel>{label}</BaseControl.VisualLabel>
        {onReset && (
          <Button
            variant='link'
            size='small'
            className='aa-preset-picker__reset'
            onClick={onReset}
          >
            {__('Reset', 'aggressive-blocks')}
          </Button>
        )}
      </Stack>
      <div className='aa-preset-picker__grid' role='group' aria-label={label}>
        {presets.map(preset => {
          const isActive = preset.key === activeKey;
          return (
            <Button
              key={preset.key}
              className='aa-preset-picker__tile'
              variant='secondary'
              isPressed={isActive}
              icon={isActive ? check : undefined}
              aria-pressed={isActive}
              label={preset.description}
              showTooltip={Boolean(preset.description)}
              onClick={() => onApply(preset)}
            >
              {preset.name}
            </Button>
          );
        })}
      </div>
    </Stack>
  );
}
