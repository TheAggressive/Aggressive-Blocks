/**
 * Modal block — Inspector panels for the close and trigger buttons.
 *
 * Split out of inspector.tsx (file-length cap). Each panel reads its own
 * attributes with the same defaults as the block.
 *
 * @module src/blocks-interactivity/modal/inspector-buttons
 */

import { PanelColorSettings } from '@wordpress/block-editor';
import {
  Notice,
  PanelBody,
  SelectControl,
  TextControl,
  ToggleControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import type { ModalAttributes } from './types';

interface ButtonPanelProps {
  attributes: ModalAttributes;
  setAttributes: (attrs: Partial<ModalAttributes>) => void;
}

/** Close Button placement / icon / size / style / label, plus its colors. */
export function CloseButtonPanels({
  attributes,
  setAttributes,
}: ButtonPanelProps): JSX.Element {
  const {
    disableOverlay = false,
    closeButtonPlacement = 'inside-top-right',
    closeButtonIcon = 'close',
    closeButtonSize = 'md',
    closeButtonVariant = 'ghost',
    closeButtonLabel = '',
    closeButtonColor = '',
    closeButtonBgColor = '',
    closeButtonHoverColor = '',
    closeButtonHoverBgColor = '',
  } = attributes;

  return (
    <>
      <PanelBody
        title={__('Close Button', 'aggressive-blocks')}
        initialOpen={false}
      >
        <SelectControl<string>
          label={__('Placement', 'aggressive-blocks')}
          value={closeButtonPlacement}
          options={[
            {
              label: __('Inside — Top Right', 'aggressive-blocks'),
              value: 'inside-top-right',
            },
            {
              label: __('Inside — Top Left', 'aggressive-blocks'),
              value: 'inside-top-left',
            },
            {
              label: __('Inside — Bottom Right', 'aggressive-blocks'),
              value: 'inside-bottom-right',
            },
            {
              label: __('Inside — Bottom Left', 'aggressive-blocks'),
              value: 'inside-bottom-left',
            },
            {
              label: __('Sticky — Top Right', 'aggressive-blocks'),
              value: 'sticky-top-right',
            },
            {
              label: __('Outside — Top Right', 'aggressive-blocks'),
              value: 'outside-top-right',
            },
            {
              label: __('Outside — Top Left', 'aggressive-blocks'),
              value: 'outside-top-left',
            },
            { label: __('Hidden', 'aggressive-blocks'), value: 'none' },
          ]}
          onChange={value => setAttributes({ closeButtonPlacement: value })}
          help={
            closeButtonPlacement === 'none'
              ? __(
                  'Modal closes via backdrop click or Escape only.',
                  'aggressive-blocks'
                )
              : closeButtonPlacement.startsWith('outside-')
                ? __(
                    'Button floats in the overlay corner, independent of the dialog.',
                    'aggressive-blocks'
                  )
                : undefined
          }
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {closeButtonPlacement === 'none' && disableOverlay && (
          <Notice status='warning' isDismissible={false}>
            {__(
              'With the overlay disabled there is no backdrop to click, so the close button stays visible.',
              'aggressive-blocks'
            )}
          </Notice>
        )}

        {closeButtonPlacement !== 'none' && (
          <>
            <SelectControl<string>
              label={__('Icon', 'aggressive-blocks')}
              value={closeButtonIcon}
              options={[
                {
                  label: __('Close (×)', 'aggressive-blocks'),
                  value: 'close',
                },
                {
                  label: __('Arrow Left (←)', 'aggressive-blocks'),
                  value: 'arrow-left',
                },
                {
                  label: __('Chevron Down (↓)', 'aggressive-blocks'),
                  value: 'chevron-down',
                },
                {
                  label: __('Text only', 'aggressive-blocks'),
                  value: 'text-only',
                },
              ]}
              onChange={value => setAttributes({ closeButtonIcon: value })}
              __next40pxDefaultSize
              __nextHasNoMarginBottom
            />

            <SelectControl<string>
              label={__('Size', 'aggressive-blocks')}
              value={closeButtonSize}
              options={[
                {
                  label: __('Small (32px)', 'aggressive-blocks'),
                  value: 'sm',
                },
                {
                  label: __('Medium (44px)', 'aggressive-blocks'),
                  value: 'md',
                },
                {
                  label: __('Large (56px)', 'aggressive-blocks'),
                  value: 'lg',
                },
              ]}
              onChange={value => setAttributes({ closeButtonSize: value })}
              __next40pxDefaultSize
              __nextHasNoMarginBottom
            />

            <SelectControl<string>
              label={__('Style', 'aggressive-blocks')}
              value={closeButtonVariant}
              options={[
                {
                  label: __('Ghost (transparent)', 'aggressive-blocks'),
                  value: 'ghost',
                },
                { label: __('Filled', 'aggressive-blocks'), value: 'filled' },
                {
                  label: __('Outlined', 'aggressive-blocks'),
                  value: 'outlined',
                },
              ]}
              onChange={value => setAttributes({ closeButtonVariant: value })}
              __next40pxDefaultSize
              __nextHasNoMarginBottom
            />

            <TextControl
              label={__('Label', 'aggressive-blocks')}
              value={closeButtonLabel}
              placeholder={__('e.g. Close', 'aggressive-blocks')}
              onChange={value => setAttributes({ closeButtonLabel: value })}
              help={__(
                'Optional visible text alongside the icon.',
                'aggressive-blocks'
              )}
              __next40pxDefaultSize
              __nextHasNoMarginBottom
            />
          </>
        )}
      </PanelBody>

      {closeButtonPlacement !== 'none' && (
        <PanelBody
          title={__('Close Button Colors', 'aggressive-blocks')}
          initialOpen={false}
        >
          <PanelColorSettings
            __experimentalIsRenderedInSidebar
            title=''
            colorSettings={[
              {
                value: closeButtonColor,
                onChange: (value: string | undefined) =>
                  setAttributes({ closeButtonColor: value ?? '' }),
                label: __('Icon / text color', 'aggressive-blocks'),
              },
              {
                value: closeButtonBgColor,
                onChange: (value: string | undefined) =>
                  setAttributes({ closeButtonBgColor: value ?? '' }),
                label: __('Background', 'aggressive-blocks'),
              },
              {
                value: closeButtonHoverColor,
                onChange: (value: string | undefined) =>
                  setAttributes({ closeButtonHoverColor: value ?? '' }),
                label: __('Hover icon / text color', 'aggressive-blocks'),
              },
              {
                value: closeButtonHoverBgColor,
                onChange: (value: string | undefined) =>
                  setAttributes({ closeButtonHoverBgColor: value ?? '' }),
                label: __('Hover background', 'aggressive-blocks'),
              },
            ]}
          />
        </PanelBody>
      )}
    </>
  );
}

/** Built-in trigger button variant, size, width, radius, and colors. */
export function TriggerButtonPanel({
  attributes,
  setAttributes,
}: ButtonPanelProps): JSX.Element {
  const {
    triggerVariant = 'outlined',
    triggerSize = 'md',
    triggerFullWidth = false,
    triggerBorderRadius = '',
    triggerBgColor = '',
    triggerTextColor = '',
    triggerHoverBgColor = '',
    triggerHoverTextColor = '',
  } = attributes;

  return (
    <PanelBody
      title={__('Trigger Button', 'aggressive-blocks')}
      initialOpen={false}
    >
      <SelectControl<string>
        label={__('Variant', 'aggressive-blocks')}
        value={triggerVariant}
        options={[
          {
            label: __('Outlined', 'aggressive-blocks'),
            value: 'outlined',
          },
          { label: __('Filled', 'aggressive-blocks'), value: 'filled' },
          { label: __('Ghost', 'aggressive-blocks'), value: 'ghost' },
          { label: __('Text', 'aggressive-blocks'), value: 'text' },
        ]}
        onChange={value => setAttributes({ triggerVariant: value })}
        __next40pxDefaultSize
        __nextHasNoMarginBottom
      />

      <SelectControl<string>
        label={__('Size', 'aggressive-blocks')}
        value={triggerSize}
        options={[
          {
            label: __('Small (32px)', 'aggressive-blocks'),
            value: 'sm',
          },
          {
            label: __('Medium (44px)', 'aggressive-blocks'),
            value: 'md',
          },
          {
            label: __('Large (52px)', 'aggressive-blocks'),
            value: 'lg',
          },
        ]}
        onChange={value => setAttributes({ triggerSize: value })}
        __next40pxDefaultSize
        __nextHasNoMarginBottom
      />

      <ToggleControl
        label={__('Full Width', 'aggressive-blocks')}
        checked={triggerFullWidth}
        onChange={value => setAttributes({ triggerFullWidth: value })}
        help={__(
          'Stretch the button to fill its container.',
          'aggressive-blocks'
        )}
        __nextHasNoMarginBottom
      />

      <TextControl
        label={__('Border Radius', 'aggressive-blocks')}
        value={triggerBorderRadius}
        placeholder='0.25rem'
        onChange={value => setAttributes({ triggerBorderRadius: value })}
        help={__(
          'e.g. 0.25rem, 9999px for pill. Leave empty for square.',
          'aggressive-blocks'
        )}
        __next40pxDefaultSize
        __nextHasNoMarginBottom
      />

      <PanelColorSettings
        __experimentalIsRenderedInSidebar
        title={__('Colors', 'aggressive-blocks')}
        colorSettings={[
          {
            value: triggerBgColor,
            onChange: (value: string | undefined) =>
              setAttributes({ triggerBgColor: value ?? '' }),
            label: __('Background', 'aggressive-blocks'),
          },
          {
            value: triggerTextColor,
            onChange: (value: string | undefined) =>
              setAttributes({ triggerTextColor: value ?? '' }),
            label: __('Text', 'aggressive-blocks'),
          },
          {
            value: triggerHoverBgColor,
            onChange: (value: string | undefined) =>
              setAttributes({ triggerHoverBgColor: value ?? '' }),
            label: __('Hover background', 'aggressive-blocks'),
          },
          {
            value: triggerHoverTextColor,
            onChange: (value: string | undefined) =>
              setAttributes({ triggerHoverTextColor: value ?? '' }),
            label: __('Hover text', 'aggressive-blocks'),
          },
        ]}
      />
    </PanelBody>
  );
}
