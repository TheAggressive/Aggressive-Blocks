import {
  expandPaddingShorthand,
  migrateLegacyDesign,
} from '../utils/migrateLegacyDesign';

describe('expandPaddingShorthand', () => {
  it.each([
    ['1rem', { top: '1rem', right: '1rem', bottom: '1rem', left: '1rem' }],
    ['1rem 2rem', { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' }],
    [
      '1rem 2rem 3rem',
      { top: '1rem', right: '2rem', bottom: '3rem', left: '2rem' },
    ],
    [
      '1px 2px 3px 4px',
      { top: '1px', right: '2px', bottom: '3px', left: '4px' },
    ],
    [
      'calc(1rem + 2px) 0',
      {
        top: 'calc(1rem + 2px)',
        right: '0',
        bottom: 'calc(1rem + 2px)',
        left: '0',
      },
    ],
  ])('expands %s', (value, expected) => {
    expect(expandPaddingShorthand(value)).toEqual(expected);
  });

  it('rejects empty and over-long values', () => {
    expect(expandPaddingShorthand('   ')).toBeNull();
    expect(expandPaddingShorthand('1px 2px 3px 4px 5px')).toBeNull();
  });
});

describe('migrateLegacyDesign', () => {
  it('moves legacy padding and radius onto block supports, legacy winning', () => {
    expect(
      migrateLegacyDesign({
        modalId: 'm',
        dialogPadding: '2rem 1rem',
        dialogBorderRadius: '12px',
        style: {
          color: { background: 'var(--wp--preset--color--surface)' },
          spacing: { padding: { top: '9px' }, margin: { top: '4px' } },
          border: { width: '2px', radius: '1px' },
        },
      })
    ).toEqual({
      modalId: 'm',
      style: {
        color: { background: 'var(--wp--preset--color--surface)' },
        spacing: {
          padding: { top: '2rem', right: '1rem', bottom: '2rem', left: '1rem' },
        },
        border: { width: '2px', radius: '12px' },
      },
    });
  });

  it('drops margin support and leaves unset values alone', () => {
    expect(
      migrateLegacyDesign({
        dialogPadding: '',
        dialogBorderRadius: '',
        style: { spacing: { margin: { top: '4px' } } },
      })
    ).toEqual({});
  });

  it('keeps existing block padding when there is no legacy padding', () => {
    const padding = { top: '1px', right: '1px', bottom: '1px', left: '1px' };
    expect(migrateLegacyDesign({ style: { spacing: { padding } } })).toEqual({
      style: { spacing: { padding } },
    });
  });
});
