import { MovieDetailsSchema } from '@reelmark/shared';

import {
  type TmdbMovieDetails,
  TmdbMovieDetailsSchema,
  type TmdbVideo,
} from '../tmdb/tmdb.schemas.js';
import {
  certificationFor,
  directorsFrom,
  logoUrlFrom,
  providersFrom,
  selectTrailer,
  toTmdbDetailsPart,
  toTmdbMovie,
  topCast,
  watchLinkFrom,
  watchOptionsFor,
} from './movie-details.mapper.js';

const KEY_UK = 'ukTrailer01';
const KEY_EN = 'enTrailer01';

function video(overrides: Partial<TmdbVideo> = {}): TmdbVideo {
  return {
    iso_639_1: 'en',
    key: KEY_EN,
    site: 'YouTube',
    type: 'Trailer',
    official: true,
    ...overrides,
  };
}

/** A details response as TMDB sends it, parsed with the real schema. */
function details(overrides: Record<string, unknown> = {}): TmdbMovieDetails {
  return TmdbMovieDetailsSchema.parse({
    id: 550,
    title: 'Бійцівський клуб',
    overview: 'Опис',
    poster_path: '/p.jpg',
    release_date: '1999-10-15',
    vote_average: 8.43,
    genres: [{ id: 18, name: 'Драма' }],
    runtime: 139,
    tagline: 'Пустота.',
    videos: { results: [video({ iso_639_1: 'uk', key: KEY_UK }), video()] },
    credits: {
      cast: [
        { name: 'Edward Norton', order: 0 },
        { name: 'Brad Pitt', order: 1 },
      ],
      crew: [
        { name: 'David Fincher', job: 'Director' },
        { name: 'Jim Uhls', job: 'Screenplay' },
      ],
    },
    release_dates: {
      results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }],
    },
    'watch/providers': {
      results: {
        UA: {
          link: 'https://www.themoviedb.org/movie/550-fight-club/watch?locale=UA',
          flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 }],
        },
      },
    },
    ...overrides,
  });
}

describe('toTmdbDetailsPart', () => {
  it('maps a details response to the contract for one region', () => {
    const part = toTmdbDetailsPart(details(), 'uk', 'UA');

    expect(part).toEqual({
      movie: {
        id: 550,
        title: 'Бійцівський клуб',
        year: 1999,
        overview: 'Опис',
        posterUrl: 'https://image.tmdb.org/t/p/w780/p.jpg',
        rating: 8.4,
        genres: ['Драма'],
      },
      runtime: 139,
      tagline: 'Пустота.',
      directors: ['David Fincher'],
      cast: ['Edward Norton', 'Brad Pitt'],
      certification: { region: 'US', value: 'R' },
      trailer: { youtubeKey: KEY_UK, lang: 'uk' },
      watch: {
        region: 'UA',
        stream: [{ name: 'Netflix', logoUrl: 'https://image.tmdb.org/t/p/w154/n.jpg' }],
        rent: [],
        buy: [],
        link: 'https://www.themoviedb.org/movie/550-fight-club/watch?locale=UA',
      },
    });
    expect(() =>
      MovieDetailsSchema.parse({ ...part, critics: { rottenTomatoes: null, metacritic: null } }),
    ).not.toThrow();
  });

  it('returns null for a movie without a usable poster', () => {
    expect(toTmdbDetailsPart(details({ poster_path: null }), 'en', 'US')).toBeNull();
  });

  it('degrades missing or malformed sections to unknown instead of failing', () => {
    const part = toTmdbDetailsPart(
      details({
        runtime: 0,
        tagline: null,
        videos: 'junk',
        credits: { cast: [{ name: '' }, { name: 'Ok', order: 'x' }], crew: null },
        release_dates: undefined,
        'watch/providers': { results: [] },
      }),
      'en',
      'US',
    );

    expect(part).toMatchObject({
      runtime: null,
      tagline: '',
      trailer: null,
      cast: ['Ok'],
      directors: [],
      certification: null,
      watch: { region: 'US', stream: [], rent: [], buy: [], link: null },
    });
  });

  it('gives the catalog the card fields with genre ids', () => {
    expect(toTmdbMovie(details())).toEqual({
      id: 550,
      title: 'Бійцівський клуб',
      overview: 'Опис',
      poster_path: '/p.jpg',
      release_date: '1999-10-15',
      vote_average: 8.43,
      genre_ids: [18],
    });
  });
});

describe('selectTrailer', () => {
  it('prefers an official trailer in the requested language', () => {
    const videos = [video(), video({ iso_639_1: 'uk', key: KEY_UK })];
    expect(selectTrailer(videos, 'uk')).toEqual({ youtubeKey: KEY_UK, lang: 'uk' });
  });

  it('falls back to an official English trailer', () => {
    expect(selectTrailer([video()], 'uk')).toEqual({ youtubeKey: KEY_EN, lang: 'en' });
  });

  it('prefers official trailers over unofficial ones in the requested language', () => {
    const videos = [video({ iso_639_1: 'uk', key: KEY_UK, official: false }), video()];
    expect(selectTrailer(videos, 'uk')).toEqual({ youtubeKey: KEY_EN, lang: 'en' });
  });

  it('takes an unofficial trailer when there is no official one', () => {
    const videos = [
      video({ official: false }),
      video({ iso_639_1: 'uk', key: KEY_UK, official: false }),
    ];
    expect(selectTrailer(videos, 'uk')).toEqual({ youtubeKey: KEY_UK, lang: 'uk' });
  });

  it.each([
    ['another site', { site: 'Vimeo' }],
    ['a teaser', { type: 'Teaser' }],
    ['another language', { iso_639_1: 'de' }],
    ['no language', { iso_639_1: null }],
    ['a short key', { key: 'abc' }],
    ['a key with a slash', { key: 'abc/def/ghi' }],
    ['a key with a query', { key: 'abcdefghi?x' }],
  ])('ignores %s', (_label, overrides) => {
    expect(selectTrailer([video(overrides)], 'en')).toBeNull();
  });

  it('keeps TMDB order within a group', () => {
    const videos = [video({ key: 'firstTrail1' }), video({ key: 'secondTrail' })];
    expect(selectTrailer(videos, 'en')?.youtubeKey).toBe('firstTrail1');
  });
});

describe('certificationFor', () => {
  const countries = [
    { iso_3166_1: 'UA', release_dates: [{ certification: '' }, { certification: ' 16+ ' }] },
    { iso_3166_1: 'US', release_dates: [{ certification: 'R' }] },
    { iso_3166_1: 'DE', release_dates: [{ certification: '' }] },
    { iso_3166_1: 'FR', release_dates: [{ certification: 'x'.repeat(17) }] },
  ];

  it("takes the region's first non-empty value, trimmed", () => {
    expect(certificationFor(countries, 'UA')).toEqual({ region: 'UA', value: '16+' });
  });

  it.each(['DE', 'FR', 'PL'])('falls back to the US for %s', (region) => {
    expect(certificationFor(countries, region)).toEqual({ region: 'US', value: 'R' });
  });

  it('is null when neither the region nor the US has one', () => {
    expect(certificationFor(countries.slice(2), 'DE')).toBeNull();
    expect(certificationFor([], 'US')).toBeNull();
  });
});

describe('topCast and directorsFrom', () => {
  it('takes the top five by billing order, without repeating an actor', () => {
    const cast = [6, 5, 4, 3, 2, 1, 0].map((order) => ({ name: `Actor ${order}`, order }));
    cast.push({ name: 'Actor 0', order: 7 });

    expect(topCast(cast)).toEqual(['Actor 0', 'Actor 1', 'Actor 2', 'Actor 3', 'Actor 4']);
  });

  it('lists each director once', () => {
    const crew = [
      { name: 'Lana Wachowski', job: 'Director' },
      { name: 'Lilly Wachowski', job: 'Director' },
      { name: 'Lana Wachowski', job: 'Director' },
      { name: 'Joel Silver', job: 'Producer' },
    ];
    expect(directorsFrom(crew)).toEqual(['Lana Wachowski', 'Lilly Wachowski']);
  });
});

describe('watch options', () => {
  it('maps flatrate to stream, rent and buy, by display priority', () => {
    const regions = new Map([
      [
        'UA',
        {
          link: null,
          flatrate: [],
          rent: [
            { provider_name: 'B', logo_path: '/b.png', display_priority: 2 },
            { provider_name: 'A', logo_path: '/a.png', display_priority: 1 },
          ],
          buy: [{ provider_name: 'C', logo_path: '/c.jpg', display_priority: 1 }],
        },
      ],
    ]);

    expect(watchOptionsFor(regions, 'UA')).toEqual({
      region: 'UA',
      stream: [],
      rent: [
        { name: 'A', logoUrl: 'https://image.tmdb.org/t/p/w154/a.png' },
        { name: 'B', logoUrl: 'https://image.tmdb.org/t/p/w154/b.png' },
      ],
      buy: [{ name: 'C', logoUrl: 'https://image.tmdb.org/t/p/w154/c.jpg' }],
      link: null,
    });
    expect(watchOptionsFor(regions, 'PL')).toEqual({
      region: 'PL',
      stream: [],
      rent: [],
      buy: [],
      link: null,
    });
  });

  it('drops providers without a usable logo and repeated names', () => {
    const providers = [
      { provider_name: 'No logo', logo_path: null, display_priority: 1 },
      { provider_name: 'Foreign', logo_path: '//evil.example/x.jpg', display_priority: 1 },
      { provider_name: 'Ok', logo_path: '/ok.jpg', display_priority: 2 },
      { provider_name: 'Ok', logo_path: '/ok2.jpg', display_priority: 3 },
    ];
    expect(providersFrom(providers)).toEqual([
      { name: 'Ok', logoUrl: 'https://image.tmdb.org/t/p/w154/ok.jpg' },
    ]);
  });

  it('builds logo URLs on image.tmdb.org only', () => {
    expect(logoUrlFrom('/x.jpg')).toBe('https://image.tmdb.org/t/p/w154/x.jpg');
    expect(logoUrlFrom('https://evil.example/x.jpg')).toBeNull();
    expect(logoUrlFrom(undefined)).toBeNull();
  });

  it('keeps a link to TMDB website pages', () => {
    const link = 'https://www.themoviedb.org/movie/550-fight-club/watch?locale=UA';
    expect(watchLinkFrom(link)).toBe(link);
  });

  it.each([
    'http://www.themoviedb.org/movie/550/watch',
    'https://themoviedb.org/movie/550/watch',
    'https://www.themoviedb.org.evil.example/movie/550',
    'https://evil.example/?www.themoviedb.org',
    'https://user:pass@www.themoviedb.org/movie/550',
    'https://www.themoviedb.org:8443/movie/550',
    'javascript:alert(1)',
    '/movie/550/watch',
    '',
    null,
    undefined,
  ])('drops the link %j', (link) => {
    expect(watchLinkFrom(link)).toBeNull();
  });
});
