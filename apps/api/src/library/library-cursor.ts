/**
 * The position of a library item in (updatedAt desc, movieId desc) order: an opaque, base64url
 * cursor that pages continue from. Keyset pagination stays correct while decisions are added or
 * removed between page requests, unlike offsets.
 */
export interface LibraryCursor {
  updatedAt: Date;
  movieId: number;
}

const CURSOR_TEXT = /^(\d{1,15})\.(\d{1,10})$/;
const MAX_MOVIE_ID = 2_147_483_647;

export function encodeLibraryCursor({ updatedAt, movieId }: LibraryCursor): string {
  return Buffer.from(`${updatedAt.getTime()}.${movieId}`).toString('base64url');
}

/** Returns null for anything that isn't a cursor produced by encodeLibraryCursor. */
export function decodeLibraryCursor(cursor: string): LibraryCursor | null {
  const match = CURSOR_TEXT.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) {
    return null;
  }
  const decoded = { updatedAt: new Date(Number(match[1])), movieId: Number(match[2]) };
  if (decoded.movieId < 1 || decoded.movieId > MAX_MOVIE_ID) {
    return null;
  }
  // Base64 decoding is lenient; requiring the canonical encoding gives each position one cursor.
  return encodeLibraryCursor(decoded) === cursor ? decoded : null;
}
