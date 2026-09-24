/**
 * DirectionPicker — native segmented control for the scroll direction.
 */

import {
  // eslint-disable-next-line @wordpress/no-unsafe-wp-apis
  __experimentalToggleGroupControl as ToggleGroupControl,
  // eslint-disable-next-line @wordpress/no-unsafe-wp-apis
  __experimentalToggleGroupControlOptionIcon as ToggleGroupControlOptionIcon,
} from '@wordpress/components';
import { arrowDown, arrowLeft, arrowRight, arrowUp } from '@wordpress/icons';
import { __ } from '@wordpress/i18n';

interface DirectionPickerProps {
  value: string;
  onChange: (_direction: string) => void;
}

const DIRECTIONS = [
  { value: 'up', icon: arrowUp, label: __('Up', 'aggressive-blocks') },
  { value: 'down', icon: arrowDown, label: __('Down', 'aggressive-blocks') },
  { value: 'left', icon: arrowLeft, label: __('Left', 'aggressive-blocks') },
  {
    value: 'right',
    icon: arrowRight,
    label: __('Right', 'aggressive-blocks'),
  },
];

export const DirectionPicker = ({ value, onChange }: DirectionPickerProps) => (
  <ToggleGroupControl
    __next40pxDefaultSize
    __nextHasNoMarginBottom
    isBlock
    label={__('Scroll direction', 'aggressive-blocks')}
    value={value}
    onChange={next => onChange(String(next))}
  >
    {DIRECTIONS.map(direction => (
      <ToggleGroupControlOptionIcon
        key={direction.value}
        value={direction.value}
        icon={direction.icon}
        label={direction.label}
      />
    ))}
  </ToggleGroupControl>
);
