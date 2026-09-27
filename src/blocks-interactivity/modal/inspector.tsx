/**
 * Modal block — Inspector controls.
 *
 * Extracted from edit.tsx to stay under the file-length cap. Pure settings UI
 * driven by the block attributes; editor-only (never shipped to the front end).
 * The close- and trigger-button panels live in inspector-buttons.tsx.
 *
 * @module src/blocks-interactivity/modal/inspector
 */

import { InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import {
  Button,
  Notice,
  PanelBody,
  RangeControl,
  SelectControl,
  TextControl,
  ToggleControl,
  Tooltip,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import type { ModalAttributes } from './types';
import type { TriggerOption } from './hooks/useTriggerManagement';
import { copyTextFallback } from './utils/copyTextFallback';
import { CloseButtonPanels, TriggerButtonPanel } from './inspector-buttons';

interface ModalInspectorProps {
  attributes: ModalAttributes;
  setAttributes: (attrs: Partial<ModalAttributes>) => void;
  safePosition: string;
  isHighlightActive: boolean;
  safeTriggerBlockId: string;
  handleRefreshHighlight: () => void;
  isSelected: boolean;
  availableTriggers: TriggerOption[];
  handleTriggerBlockChange: (selectedBlockId: string) => void;
}

export function ModalInspector({
  attributes,
  setAttributes,
  safePosition,
  isHighlightActive,
  safeTriggerBlockId,
  handleRefreshHighlight,
  isSelected,
  availableTriggers,
  handleTriggerBlockChange,
}: ModalInspectorProps): JSX.Element {
  const {
    openOnLoad = false,
    modalId = '',
    triggerLabel = 'Open Modal',
    disableOverlay = false,
    enterAnimation = 'fade',
    exitAnimation = 'fade',
    animationDuration = 300,
    exitIntentTrigger = false,
    exitIntentReshowDays = 7,
    scrollDepthTrigger = false,
    scrollDepthPercent = 50,
    openOnLoadOnce = false,
    dialogMaxWidth = '',
    dialogLabel = '',
    overlayOpacity = 50,
    overlayBlur = 4,
    overlayColor = '',
  } = attributes;

  return (
    <InspectorControls>
      <PanelBody
        title={__('Modal Settings', 'aggressive-blocks')}
        initialOpen={true}
      >
        {/* Modal ID */}
        <TextControl
          label={__('Modal ID', 'aggressive-blocks')}
          value={modalId}
          onChange={value => setAttributes({ modalId: value })}
          help={__(
            'Unique identifier for this modal. Used to link triggers to this modal.',
            'aggressive-blocks'
          )}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Position */}
        <SelectControl<string>
          label={__('Modal Position', 'aggressive-blocks')}
          value={safePosition}
          options={[
            { label: __('Center', 'aggressive-blocks'), value: 'center' },
            { label: __('Top Left', 'aggressive-blocks'), value: 'top-left' },
            {
              label: __('Top Right', 'aggressive-blocks'),
              value: 'top-right',
            },
            {
              label: __('Bottom Left', 'aggressive-blocks'),
              value: 'bottom-left',
            },
            {
              label: __('Bottom Right', 'aggressive-blocks'),
              value: 'bottom-right',
            },
            {
              label: __('Bottom Sheet', 'aggressive-blocks'),
              value: 'bottom',
            },
            { label: __('Top Drawer', 'aggressive-blocks'), value: 'top' },
            { label: __('Left Panel', 'aggressive-blocks'), value: 'left' },
            { label: __('Right Panel', 'aggressive-blocks'), value: 'right' },
          ]}
          onChange={value => setAttributes({ position: value })}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Max width */}
        <TextControl
          label={__('Max Width', 'aggressive-blocks')}
          value={dialogMaxWidth}
          placeholder='40rem'
          onChange={value => setAttributes({ dialogMaxWidth: value })}
          help={__(
            'e.g. 40rem, 600px, 80vw. Leave empty for default (40rem).',
            'aggressive-blocks'
          )}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Accessible name */}
        <TextControl
          label={__('Dialog Name', 'aggressive-blocks')}
          value={dialogLabel}
          onChange={value => setAttributes({ dialogLabel: value })}
          help={__(
            'What screen readers announce when the modal opens. Leave empty to use the first heading inside the modal.',
            'aggressive-blocks'
          )}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Open on load */}
        <ToggleControl
          label={__('Open on Page Load', 'aggressive-blocks')}
          checked={openOnLoad}
          onChange={value => setAttributes({ openOnLoad: value })}
          help={__(
            'Automatically open the modal when the page loads.',
            'aggressive-blocks'
          )}
          __nextHasNoMarginBottom
        />

        {openOnLoad && (
          <ToggleControl
            label={__('Show Once Per Visitor', 'aggressive-blocks')}
            checked={openOnLoadOnce}
            onChange={value => setAttributes({ openOnLoadOnce: value })}
            help={__(
              "Don't reopen after the visitor has seen it once.",
              'aggressive-blocks'
            )}
            __nextHasNoMarginBottom
          />
        )}

        {/* Disable overlay */}
        <ToggleControl
          label={__('Disable Overlay', 'aggressive-blocks')}
          checked={disableOverlay}
          onChange={value => setAttributes({ disableOverlay: value })}
          help={__(
            'When enabled, the modal will not have a background overlay',
            'aggressive-blocks'
          )}
          __nextHasNoMarginBottom
        />

        {/* Exit intent trigger */}
        <ToggleControl
          label={__('Exit Intent Trigger', 'aggressive-blocks')}
          checked={exitIntentTrigger}
          onChange={value => setAttributes({ exitIntentTrigger: value })}
          help={__(
            'Open the modal when the pointer leaves the top of the window, as if heading for the tabs or address bar. Desktop only.',
            'aggressive-blocks'
          )}
          __nextHasNoMarginBottom
        />

        {exitIntentTrigger && (
          <RangeControl
            label={__('Re-show After (days)', 'aggressive-blocks')}
            value={exitIntentReshowDays}
            onChange={value => setAttributes({ exitIntentReshowDays: value })}
            min={1}
            max={90}
            step={1}
            help={__(
              'Days before showing the exit intent modal again to the same visitor.',
              'aggressive-blocks'
            )}
            __nextHasNoMarginBottom
          />
        )}

        {/* Scroll depth trigger */}
        <ToggleControl
          label={__('Scroll Depth Trigger', 'aggressive-blocks')}
          checked={scrollDepthTrigger}
          onChange={value => setAttributes({ scrollDepthTrigger: value })}
          help={__(
            'Open when the visitor scrolls to a percentage of the page. Works on all devices.',
            'aggressive-blocks'
          )}
          __nextHasNoMarginBottom
        />

        {scrollDepthTrigger && (
          <RangeControl
            label={__('Scroll Depth (%)', 'aggressive-blocks')}
            value={scrollDepthPercent}
            onChange={value => setAttributes({ scrollDepthPercent: value })}
            min={10}
            max={100}
            step={5}
            help={__(
              'Percentage of the page scrolled before the modal opens.',
              'aggressive-blocks'
            )}
            __nextHasNoMarginBottom
          />
        )}

        {/* Trigger block select */}
        <SelectControl<string>
          label={__('Trigger Block', 'aggressive-blocks')}
          value={safeTriggerBlockId}
          options={availableTriggers}
          onChange={handleTriggerBlockChange}
          help={__('Select a block to trigger this modal', 'aggressive-blocks')}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Show highlight status */}
        {isHighlightActive && safeTriggerBlockId && isSelected && (
          <Notice status='info' isDismissible={false}>
            {__(
              'Trigger block is highlighted in the editor',
              'aggressive-blocks'
            )}
          </Notice>
        )}

        {/* Show message when not selected */}
        {safeTriggerBlockId && !isSelected && (
          <Notice status='warning' isDismissible={false}>
            {__(
              'Select this modal to highlight the trigger block',
              'aggressive-blocks'
            )}
          </Notice>
        )}

        {/* Refresh highlight button */}
        {safeTriggerBlockId && (
          <Tooltip
            text={
              !isSelected
                ? __(
                    'Select the modal first to use this button',
                    'aggressive-blocks'
                  )
                : ''
            }
          >
            <div>
              <Button
                variant='secondary'
                onClick={handleRefreshHighlight}
                className='refresh-highlight-button'
                disabled={!isSelected}
              >
                {__('Refresh Highlight', 'aggressive-blocks')}
              </Button>
            </div>
          </Tooltip>
        )}

        {/* Trigger label (only if no block selected) */}
        {!safeTriggerBlockId && (
          <TextControl
            label={__('Trigger Button Label', 'aggressive-blocks')}
            value={triggerLabel}
            onChange={value => setAttributes({ triggerLabel: value })}
            __next40pxDefaultSize
            __nextHasNoMarginBottom
          />
        )}
      </PanelBody>

      {/* Manual connection panel */}
      <PanelBody
        title={__('Manual Connection', 'aggressive-blocks')}
        initialOpen={false}
      >
        <p>
          {__(
            'To connect any HTML element to this modal, add this class:',
            'aggressive-blocks'
          )}
        </p>
        {modalId && (
          <>
            <code className='modal-connection-code'>
              modal-trigger-{modalId}
            </code>
            <p className='modal-connection-example'>
              {__('Example:', 'aggressive-blocks')}
              <br />
              <code>{`<button type="button" class="modal-trigger-${modalId}">Open Modal</button>`}</code>
            </p>
            <Button
              variant='secondary'
              onClick={() => {
                const textToCopy = `modal-trigger-${modalId}`;
                // Check if the Clipboard API is available.
                if (
                  navigator &&
                  navigator.clipboard &&
                  navigator.clipboard.writeText
                ) {
                  navigator.clipboard.writeText(textToCopy).catch(() => {
                    // Fallback to textarea method if writeText fails.
                    copyTextFallback(textToCopy);
                  });
                } else {
                  // Fallback method using a temporary textarea.
                  copyTextFallback(textToCopy);
                }
              }}
            >
              {__('Copy to Clipboard', 'aggressive-blocks')}
            </Button>
          </>
        )}
      </PanelBody>

      {/* Animation panel */}
      <PanelBody
        title={__('Animation Settings', 'aggressive-blocks')}
        initialOpen={false}
      >
        {/* Enter animation */}
        <SelectControl<string>
          label={__('Enter Animation', 'aggressive-blocks')}
          value={enterAnimation}
          options={[
            { label: __('Fade', 'aggressive-blocks'), value: 'fade' },
            { label: __('Slide Up', 'aggressive-blocks'), value: 'slide-up' },
            {
              label: __('Slide Down', 'aggressive-blocks'),
              value: 'slide-down',
            },
            {
              label: __('Slide Left', 'aggressive-blocks'),
              value: 'slide-left',
            },
            {
              label: __('Slide Right', 'aggressive-blocks'),
              value: 'slide-right',
            },
            { label: __('Zoom In', 'aggressive-blocks'), value: 'zoom-in' },
            { label: __('Expand', 'aggressive-blocks'), value: 'expand' },
            { label: __('Recede', 'aggressive-blocks'), value: 'recede' },
            { label: __('Lift', 'aggressive-blocks'), value: 'lift' },
            { label: __('Spring', 'aggressive-blocks'), value: 'spring' },
            { label: __('Pop', 'aggressive-blocks'), value: 'pop' },
            { label: __('Warp', 'aggressive-blocks'), value: 'warp' },
            { label: __('Material', 'aggressive-blocks'), value: 'material' },
            { label: __('Float', 'aggressive-blocks'), value: 'float' },
            { label: __('Drift', 'aggressive-blocks'), value: 'drift' },
            { label: __('Flip Up', 'aggressive-blocks'), value: 'flip-up' },
            { label: __('Blur', 'aggressive-blocks'), value: 'blur' },
            { label: __('None', 'aggressive-blocks'), value: 'none' },
          ]}
          onChange={value => setAttributes({ enterAnimation: value })}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Exit animation */}
        <SelectControl<string>
          label={__('Exit Animation', 'aggressive-blocks')}
          value={exitAnimation}
          options={[
            { label: __('Fade', 'aggressive-blocks'), value: 'fade' },
            { label: __('Slide Up', 'aggressive-blocks'), value: 'slide-up' },
            {
              label: __('Slide Down', 'aggressive-blocks'),
              value: 'slide-down',
            },
            {
              label: __('Slide Left', 'aggressive-blocks'),
              value: 'slide-left',
            },
            {
              label: __('Slide Right', 'aggressive-blocks'),
              value: 'slide-right',
            },
            { label: __('Zoom Out', 'aggressive-blocks'), value: 'zoom-out' },
            { label: __('Zoom In', 'aggressive-blocks'), value: 'zoom-in' },
            { label: __('Expand', 'aggressive-blocks'), value: 'expand' },
            { label: __('Recede', 'aggressive-blocks'), value: 'recede' },
            { label: __('Pop', 'aggressive-blocks'), value: 'pop' },
            {
              label: __('Flip Down', 'aggressive-blocks'),
              value: 'flip-down',
            },
            { label: __('Blur', 'aggressive-blocks'), value: 'blur' },
            { label: __('None', 'aggressive-blocks'), value: 'none' },
          ]}
          onChange={value => setAttributes({ exitAnimation: value })}
          help={__(
            'Drawers and sheets always exit off-screen regardless of this setting.',
            'aggressive-blocks'
          )}
          __next40pxDefaultSize
          __nextHasNoMarginBottom
        />

        {/* Animation Duration */}
        <RangeControl
          label={__('Animation Duration (ms)', 'aggressive-blocks')}
          value={animationDuration}
          onChange={value => setAttributes({ animationDuration: value })}
          min={100}
          max={1000}
          step={50}
          __nextHasNoMarginBottom
        />
      </PanelBody>

      <CloseButtonPanels
        attributes={attributes}
        setAttributes={setAttributes}
      />

      {/* Trigger Button panel — only relevant when using the built-in trigger */}
      {!safeTriggerBlockId && (
        <TriggerButtonPanel
          attributes={attributes}
          setAttributes={setAttributes}
        />
      )}

      {/* Modal Design panel */}
      <PanelBody
        title={__('Modal Design', 'aggressive-blocks')}
        initialOpen={false}
      >
        <p className='components-base-control__help' style={{ marginTop: 0 }}>
          {__(
            'Style the panel from the Styles tab: color, border, padding, and shadow apply to the dialog. Theme color presets adapt to light and dark mode.',
            'aggressive-blocks'
          )}
        </p>

        <RangeControl
          label={__('Overlay Opacity (%)', 'aggressive-blocks')}
          value={overlayOpacity}
          onChange={value => setAttributes({ overlayOpacity: value })}
          min={0}
          max={90}
          step={5}
          help={__('Darkness of the backdrop overlay.', 'aggressive-blocks')}
          __nextHasNoMarginBottom
        />

        <RangeControl
          label={__('Overlay Blur (px)', 'aggressive-blocks')}
          value={overlayBlur}
          onChange={value => setAttributes({ overlayBlur: value })}
          min={0}
          max={20}
          step={1}
          help={__(
            'Backdrop blur behind the overlay. Set to 0 to disable.',
            'aggressive-blocks'
          )}
          __nextHasNoMarginBottom
        />

        <PanelColorSettings
          __experimentalIsRenderedInSidebar
          title={__('Overlay Color', 'aggressive-blocks')}
          colorSettings={[
            {
              value: overlayColor,
              onChange: (value: string | undefined) =>
                setAttributes({ overlayColor: value ?? '' }),
              label: __('Backdrop color', 'aggressive-blocks'),
            },
          ]}
        />
      </PanelBody>
    </InspectorControls>
  );
}
