import { DeckResponseSchema } from '@reelmark/shared';

import type { TmdbMovie } from '../tmdb/tmdb.schemas.js';
import {
  type CatalogMovie,
  catalogMovieToCard,
  fillMissingOverviews,
  hasMissingOverviews,
  posterUrlFrom,
  ratingFrom,
  toDeckResponse,
  toMovieCard,
  validPosterPath,
  yearFrom,
} from './movie-card.mapper.js';

const genres = new Map([
  [27, 'Horror'],
  [53, 'Thriller'],
]);

function tmdbMovie(overrides: Partial<TmdbMovie> = {}): TmdbMovie {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac…',
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    release_date: '1999-10-15',
    vote_average: 8.433,
    genre_ids: [53],
    ...overrides,
  };
}

describe('toMovieCard', () => {
  it('maps a TMDB movie to a MovieCard', () => {
    expect(toMovieCard(tmdbMovie(), genres)).toEqual({
      id: 550,
      title: 'Fight Club',
      year: 1999,
      overview: 'A ticking-time-bomb insomniac…',
      posterUrl: 'https://image.tmdb.org/t/p/w780/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      rating: 8.4,
      genres: ['Thriller'],
    });
  });

  it.each([null, undefined, ''])('returns null for poster_path=%s', (p) => {
    expect(toMovieCard(tmdbMovie({ poster_path: p }), genres)).toBeNull();
  });

  it('maps genre ids to names and drops unknown ids', () => {
    const card = toMovieCard(tmdbMovie({ genre_ids: [27, 999, 53] }), genres);
    expect(card?.genres).toEqual(['Horror', 'Thriller']);
  });
});

describe('posterUrlFrom', () => {
  it.each([
    '//evil.example/x.jpg',
    '/../../x.jpg',
    '/x.jpg?token=1',
    'x.jpg',
    '/x.gif',
    '/x.jpg\n',
    `/${'a'.repeat(101)}.jpg`, // over the 100-character cap
  ])('returns null for the malformed path %j', (path) => {
    expect(posterUrlFrom(path)).toBeNull();
  });

  it('accepts png, webp and names up to 100 characters', () => {
    expect(posterUrlFrom('/a_B-1.png')).toBe('https://image.tmdb.org/t/p/w780/a_B-1.png');
    expect(posterUrlFrom('/abc.webp')).not.toBeNull();
    expect(posterUrlFrom(`/${'a'.repeat(100)}.jpg`)).not.toBeNull();
  });
});

/** Cards 1 and 3 have an empty or blank overview; card 2 has its own. */
const deckWithBlanks = toDeckResponse(
  {
    page: 1,
    total_pages: 1,
    results: [
      tmdbMovie({ id: 1, overview: '' }),
      tmdbMovie({ id: 2, overview: 'Власний опис' }),
      tmdbMovie({ id: 3, overview: ' ' }),
    ],
  },
  genres,
);

describe('hasMissingOverviews', () => {
  it('is true when a card has an empty or blank overview', () => {
    expect(hasMissingOverviews(deckWithBlanks)).toBe(true);
  });

  it('is false when every card has an overview', () => {
    const complete = {
      ...deckWithBlanks,
      items: deckWithBlanks.items.filter((card) => card.id === 2),
    };
    expect(hasMissingOverviews(complete)).toBe(false);
  });
});

describe('fillMissingOverviews', () => {
  it('fills only blank overviews, matched by id, without mutating the input', () => {
    const filled = fillMissingOverviews(deckWithBlanks, [
      tmdbMovie({ id: 2, overview: 'English 2' }),
      tmdbMovie({ id: 1, overview: 'English 1' }),
      tmdbMovie({ id: 3, overview: '' }), // nothing better to offer
    ]);

    expect(filled.items.map((card) => card.overview)).toEqual(['English 1', 'Власний опис', ' ']);
    expect(deckWithBlanks.items[0]?.overview).toBe('');
  });
});

describe('yearFrom', () => {
  it('takes the year from YYYY-MM-DD', () => {
    expect(yearFrom('2024-02-29')).toBe(2024);
  });

  it.each([null, undefined, '', 'soon', '2024', '2024-13-01', '24-01-01'])(
    'returns null for %j',
    (date) => {
      expect(yearFrom(date)).toBeNull();
    },
  );
});

describe('ratingFrom', () => {
  it.each([
    [7.25, 7.3],
    [8.449, 8.4],
    [0, 0],
    [10, 10],
    [-1, 0],
    [10.5, 10],
  ])('rounds and clamps %d to %d', (input, expected) => {
    expect(ratingFrom(input)).toBe(expected);
  });
});

describe('toDeckResponse', () => {
  it('maps a page, drops poster-less movies and caps totalPages at 500', () => {
    const deck = toDeckResponse(
      {
        page: 3,
        total_pages: 48_213,
        results: [
          tmdbMovie({ id: 1 }),
          tmdbMovie({ id: 2, poster_path: null }),
          tmdbMovie({ id: 3, release_date: undefined }),
        ],
      },
      genres,
    );

    expect(deck.page).toBe(3);
    expect(deck.totalPages).toBe(500);
    expect(deck.items.map((card) => card.id)).toEqual([1, 3]);
    expect(deck.items[1]?.year).toBeNull();
    // The result satisfies the contract the mobile app relies on.
    expect(() => DeckResponseSchema.parse(deck)).not.toThrow();
  });

  it('keeps a small total_pages as is', () => {
    const deck = toDeckResponse({ page: 1, total_pages: 0, results: [] }, genres);
    expect(deck).toEqual({ page: 1, totalPages: 0, items: [] });
  });
});

describe('validPosterPath', () => {
  it('returns a well-formed path unchanged and null for anything else', () => {
    expect(validPosterPath('/abc.jpg')).toBe('/abc.jpg');
    expect(validPosterPath('//evil.example/x.jpg')).toBeNull();
    expect(validPosterPath(null)).toBeNull();
  });
});

describe('catalogMovieToCard', () => {
  function catalogMovie(
    translations: { locale: string; title: string; overview: string }[],
    overrides: Partial<CatalogMovie> = {},
  ): CatalogMovie {
    return {
      id: 550,
      posterPath: '/p.jpg',
      releaseYear: 1999,
      rating: 8.4,
      genreIds: [53, 999],
      updatedAt: new Date(),
      translations: translations.map((t) => ({ movieId: 550, ...t })),
      ...overrides,
    };
  }

  it('builds a card in the requested language', () => {
    const movie = catalogMovie([
      { locale: 'en', title: 'Fight Club', overview: 'English' },
      { locale: 'uk', title: 'Бійцівський клуб', overview: 'Українською' },
    ]);

    expect(catalogMovieToCard(movie, 'uk', genres)).toEqual({
      id: 550,
      title: 'Бійцівський клуб',
      year: 1999,
      overview: 'Українською',
      posterUrl: 'https://image.tmdb.org/t/p/w780/p.jpg',
      rating: 8.4,
      genres: ['Thriller'],
    });
  });

  it('falls back to the English overview when the requested one is blank', () => {
    const movie = catalogMovie([
      { locale: 'uk', title: 'Бійцівський клуб', overview: ' ' },
      { locale: 'en', title: 'Fight Club', overview: 'English' },
    ]);

    expect(catalogMovieToCard(movie, 'uk', genres)).toMatchObject({
      title: 'Бійцівський клуб',
      overview: 'English',
    });
  });

  it('takes the title from another language rather than dropping the card', () => {
    const movie = catalogMovie([{ locale: 'uk', title: 'Бійцівський клуб', overview: 'Опис' }]);

    // The Ukrainian overview is not used for an English card: only English is a fallback.
    expect(catalogMovieToCard(movie, 'en', genres)).toMatchObject({
      title: 'Бійцівський клуб',
      overview: '',
    });
  });

  it('returns null for an unusable poster or a movie without texts', () => {
    const texts = [{ locale: 'en', title: 'Fight Club', overview: '' }];

    expect(
      catalogMovieToCard(catalogMovie(texts, { posterPath: 'x.gif' }), 'en', genres),
    ).toBeNull();
    expect(catalogMovieToCard(catalogMovie([]), 'en', genres)).toBeNull();
  });
});
