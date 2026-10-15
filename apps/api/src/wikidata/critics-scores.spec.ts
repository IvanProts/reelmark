import { criticsScoresQuery, latestScores, parseScore } from './critics-scores.js';

const RT = 'http://www.wikidata.org/entity/Q105584';
const MC = 'http://www.wikidata.org/entity/Q150248';

/** A SPARQL result row as Wikidata sends it. */
function row(source: string, value: string, date?: string): Record<string, unknown> {
  return {
    source: { type: 'uri', value: source },
    value: { type: 'literal', value },
    ...(date && {
      date: {
        datatype: 'http://www.w3.org/2001/XMLSchema#dateTime',
        type: 'literal',
        value: date,
      },
    }),
  };
}

describe('parseScore', () => {
  it.each([
    ['93%', 93],
    ['0%', 0],
    ['100%', 100],
    ['81/100', 81],
    [' 81 / 100 ', 81],
  ])('reads %j as %d', (text, score) => {
    expect(parseScore(text)).toBe(score);
  });

  it.each(['7.4/10', '9/10', '93.5%', '101%', '120/100', '81/1000', '-5%', '%', 'A+', '', 'NaN%'])(
    'ignores %j',
    (text) => {
      expect(parseScore(text)).toBeNull();
    },
  );
});

describe('latestScores', () => {
  it('keeps the latest statement per source and ignores other formats', () => {
    expect(
      latestScores([
        row(RT, '85%', '2019-01-01T00:00:00Z'),
        row(RT, '93%', '2024-06-01T00:00:00Z'),
        row(RT, '7.4/10', '2025-01-01T00:00:00Z'), // average rating: another format
        row(RT, '90%', '2021-01-01T00:00:00Z'),
        row(MC, '81/100', '2020-01-01T00:00:00Z'),
        row(MC, '79/100'), // undated: older than any dated statement
      ]),
    ).toEqual({ rottenTomatoes: 93, metacritic: 81 });
  });

  it('uses an undated statement when it is the only one, the first of several', () => {
    expect(latestScores([row(MC, '70/100'), row(MC, '75/100')])).toEqual({
      rottenTomatoes: null,
      metacritic: 70,
    });
  });

  it('treats an unparsable date as undated', () => {
    expect(latestScores([row(RT, '60%', '2020-01-01T00:00:00Z'), row(RT, '99%', 'soon')])).toEqual({
      rottenTomatoes: 60,
      metacritic: null,
    });
  });

  it('ignores unknown sources and malformed rows', () => {
    expect(
      latestScores([
        row('http://www.wikidata.org/entity/Q1', '99%'),
        row(`${RT}x`, '99%'),
        { source: { value: RT } },
        { source: { value: RT }, value: { value: 93 } },
        row(RT, `${'9'.repeat(60)}%`),
        null,
        'junk',
      ]),
    ).toEqual({ rottenTomatoes: null, metacritic: null });
  });

  it('is all null for no rows', () => {
    expect(latestScores([])).toEqual({ rottenTomatoes: null, metacritic: null });
  });
});

describe('criticsScoresQuery', () => {
  it('embeds the id as an integer, quoted as the P4947 string value', () => {
    const query = criticsScoresQuery(550);
    expect(query).toContain('wdt:P4947 "550"');
    expect(query).toContain('wd:Q105584 wd:Q150248');
    expect(query).toContain('pq:P585');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'refuses the id %d',
    (id) => {
      expect(() => criticsScoresQuery(id)).toThrow(RangeError);
    },
  );
});
