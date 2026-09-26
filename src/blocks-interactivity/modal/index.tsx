import { registerThemeBlock } from '../../utils/register-theme-block';

import './editor.css';
import './style.css';

import metadata from './block.json';
import blockIcon from './icon';
import Edit from './edit';
import Save from './save';
import deprecated from './deprecated';
import type { ModalAttributes } from './types';

registerThemeBlock<ModalAttributes>(metadata, {
  icon: blockIcon,
  edit: Edit,
  save: Save,
  deprecated,
});
