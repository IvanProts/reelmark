import { decodeLibraryCursor, encodeLibraryCursor } from './library-cursor.js';

describe('library cursors', () => {
  it('round-trip a position and look opaque', () => {
    const position = { updatedAt: new Date('2026-10-09T12:34:56.789Z'), movieId: 550 };

    const cursor = encodeLibraryCursor(position);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]{1,200}$/);
    expect(decodeLibraryCursor(cursor)).toEqual(position);
  });

  it.each([
    ['empty', ''],
    ['not base64url text', 'not-a-cursor'],
    ['no separator', Buffer.from('1760000000000').toString('base64url')],
    ['a negative id', Buffer.from('1760000000000.-5').toString('base64url')],
    ['a zero id', Buffer.from('1760000000000.0').toString('base64url')],
    ['an id over 2^31-1', Buffer.from('1760000000000.2147483648').toString('base64url')],
    ['a fractional time', Buffer.from('1760000000000.5.7').toString('base64url')],
    ['trailing junk', `${Buffer.from('1760000000000.5').toString('base64url')}x`],
    ['base64 padding', `${Buffer.from('1760000000000.55').toString('base64')}`],
  ])('reject %s', (_name, cursor) => {
    expect(decodeLibraryCursor(cursor)).toBeNull();
  });
});
