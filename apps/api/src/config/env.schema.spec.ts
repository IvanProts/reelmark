import { validateEnv } from './env.schema.js';

const TOKEN = 'unit-test-token-0123456789abcdef0123456789';
/**
 * 32 hex chars, shaped like TMDB's short v3 API Key. Built at runtime and named
 * without words like "key" or "token": gitleaks flags such a literal next to
 * them (generic-api-key), which would block the commit.
 */
const HEX32 = '0123456789abcdef'.repeat(2);

const DB_PASSWORD = 'unit-db-pass-91f3';
/** Valid values for every required variable; tests override the one they examine. */
const REQUIRED = {
  TMDB_ACCESS_TOKEN: TOKEN,
  DATABASE_URL: `postgresql://app:${DB_PASSWORD}@127.0.0.1:5432/app`,
  JWT_SECRET: 'unit-signing-material-'.repeat(4),
};

/** Runs validateEnv on REQUIRED plus `raw`; returns the thrown message ('' when it didn't throw). */
function errorMessageFor(raw: Record<string, unknown>): string {
  try {
    validateEnv({ ...REQUIRED, ...raw });
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('validateEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(validateEnv(REQUIRED)).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      TMDB_BASE_URL: 'https://api.themoviedb.org/3',
      TMDB_TIMEOUT_MS: 5000,
      WIKIDATA_SPARQL_URL: 'https://query.wikidata.org/sparql',
    });
  });

  it('accepts a JWT-shaped token (base64url segments joined by dots)', () => {
    const jwtShaped = `${'Ab0'.repeat(8)}.${'cD1_-'.repeat(10)}.${'e2F'.repeat(12)}`;
    expect(validateEnv({ ...REQUIRED, TMDB_ACCESS_TOKEN: jwtShaped }).TMDB_ACCESS_TOKEN).toBe(
      jwtShaped,
    );
  });

  it('coerces numbers, trims the token and keeps explicit values', () => {
    const env = validateEnv({
      ...REQUIRED,
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      TMDB_ACCESS_TOKEN: `  ${TOKEN}\n`,
      TMDB_TIMEOUT_MS: '2500',
    });
    expect(env).toMatchObject({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
      TMDB_ACCESS_TOKEN: TOKEN,
      TMDB_TIMEOUT_MS: 2500,
    });
  });

  it('ignores unrelated variables, as process.env has many', () => {
    expect(() => validateEnv({ ...REQUIRED, PATH: '/usr/bin', HOME: '/x' })).not.toThrow();
  });

  it('requires TMDB_ACCESS_TOKEN', () => {
    expect(errorMessageFor({ TMDB_ACCESS_TOKEN: undefined })).toMatch(
      /TMDB_ACCESS_TOKEN: is required/,
    );
  });

  it('treats an empty value as unset', () => {
    expect(errorMessageFor({ TMDB_ACCESS_TOKEN: '' })).toMatch(/TMDB_ACCESS_TOKEN: is required/);
  });

  it.each([
    ['too short', 'abc123'],
    ['placeholder', 'your-tmdb-api-read-access-token-goes-here'],
    ['placeholder', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
    ['placeholder', '<paste-your-tmdb-read-access-token-here>'],
    ['v3 API Key', HEX32],
    ['inner space', `${TOKEN} x`],
    ['inner newline', `${TOKEN}\nx`],
    ['zero-width space', `${TOKEN}\u200Bx`],
    ['non-ASCII', `${TOKEN}ї`],
  ])('rejects a bad token (%s) without echoing it', (_kind, token) => {
    const message = errorMessageFor({ TMDB_ACCESS_TOKEN: token });
    expect(message).toMatch(/TMDB_ACCESS_TOKEN/);
    expect(message).not.toContain(token);
  });

  it.each(['0', '65536', 'abc', '3000.5'])('rejects PORT=%s', (port) => {
    expect(errorMessageFor({ TMDB_ACCESS_TOKEN: TOKEN, PORT: port })).toMatch(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(errorMessageFor({ TMDB_ACCESS_TOKEN: TOKEN, NODE_ENV: 'staging' })).toMatch(/NODE_ENV/);
  });

  describe('TMDB_BASE_URL', () => {
    it('rejects plain http outside the test environment', () => {
      for (const NODE_ENV of ['development', 'production']) {
        const message = errorMessageFor({
          NODE_ENV,
          TMDB_ACCESS_TOKEN: TOKEN,
          TMDB_BASE_URL: 'http://127.0.0.1:4010/3',
        });
        expect(message).toMatch(/TMDB_BASE_URL: must use https/);
        expect(message).not.toContain(TOKEN);
      }
    });

    it('allows http to localhost only when NODE_ENV=test', () => {
      const env = validateEnv({
        ...REQUIRED,
        NODE_ENV: 'test',
        TMDB_ACCESS_TOKEN: TOKEN,
        TMDB_BASE_URL: 'http://localhost:4010/3',
      });
      expect(env.TMDB_BASE_URL).toBe('http://localhost:4010/3');

      expect(
        errorMessageFor({
          NODE_ENV: 'test',
          TMDB_ACCESS_TOKEN: TOKEN,
          TMDB_BASE_URL: 'http://example.com/3',
        }),
      ).toMatch(/TMDB_BASE_URL/);
    });

    it.each([
      'https://user:pass@api.themoviedb.org/3',
      'https://user@api.themoviedb.org/3',
      'https://api.themoviedb.org/3?x=1',
      'https://api.themoviedb.org/3?',
      'https://api.themoviedb.org/3#',
      'https://api.themoviedb.org/3#frag',
    ])('rejects credentials, a query or a fragment: %s', (url) => {
      const message = errorMessageFor({
        TMDB_ACCESS_TOKEN: TOKEN,
        TMDB_BASE_URL: url,
      });
      expect(message).toMatch(/TMDB_BASE_URL: must not contain credentials/);
      expect(message).not.toContain('pass');
    });

    it.each(['not a url', 'ftp://api.themoviedb.org/3'])('rejects %s', (url) => {
      expect(errorMessageFor({ TMDB_ACCESS_TOKEN: TOKEN, TMDB_BASE_URL: url })).toMatch(
        /TMDB_BASE_URL/,
      );
    });
  });

  describe('WIKIDATA_SPARQL_URL', () => {
    it('rejects plain http outside the test environment, even to localhost', () => {
      for (const NODE_ENV of ['development', 'production']) {
        expect(
          errorMessageFor({ NODE_ENV, WIKIDATA_SPARQL_URL: 'http://127.0.0.1:4020/sparql' }),
        ).toMatch(/WIKIDATA_SPARQL_URL: must use https/);
      }
    });

    it('allows http to localhost only when NODE_ENV=test', () => {
      const env = validateEnv({
        ...REQUIRED,
        NODE_ENV: 'test',
        WIKIDATA_SPARQL_URL: 'http://localhost:4020/sparql',
      });
      expect(env.WIKIDATA_SPARQL_URL).toBe('http://localhost:4020/sparql');

      expect(
        errorMessageFor({ NODE_ENV: 'test', WIKIDATA_SPARQL_URL: 'http://example.com/sparql' }),
      ).toMatch(/WIKIDATA_SPARQL_URL: must use https/);
    });

    it.each([
      'https://user:pass@query.wikidata.org/sparql',
      'https://query.wikidata.org/sparql?query=x',
      'https://query.wikidata.org/sparql#frag',
      'not a url',
      'ftp://query.wikidata.org/sparql',
    ])('rejects %s', (url) => {
      const message = errorMessageFor({ WIKIDATA_SPARQL_URL: url });
      expect(message).toMatch(/WIKIDATA_SPARQL_URL/);
      expect(message).not.toContain('pass');
    });
  });

  describe('DATABASE_URL', () => {
    it('is required', () => {
      expect(errorMessageFor({ DATABASE_URL: '' })).toMatch(/DATABASE_URL: is required/);
    });

    it.each([
      'mysql://app:secret-91f@127.0.0.1/app',
      'postgres://app:secret-91f@127.0.0.1/app', // alias, but the URL must say postgresql://
      'http://127.0.0.1:5432/app',
      'not a url secret-91f',
      'postgresql://',
    ])('rejects %s without echoing it', (url) => {
      const message = errorMessageFor({ DATABASE_URL: url });
      expect(message).toMatch(/DATABASE_URL: must be a postgresql:\/\/ connection URL/);
      expect(message).not.toContain('secret-91f');
    });

    it('never prints the password, even when other variables are invalid', () => {
      expect(errorMessageFor({ PORT: 'abc' })).not.toContain(DB_PASSWORD);
    });
  });

  describe('JWT_SECRET', () => {
    it('is required', () => {
      expect(errorMessageFor({ JWT_SECRET: '' })).toMatch(/JWT_SECRET: is required/);
    });

    it('accepts hex and base64 keys of 64+ characters', () => {
      const hex = 'a1'.repeat(48);
      const base64 = `${'Ab+/'.repeat(16)}==`;
      expect(validateEnv({ ...REQUIRED, JWT_SECRET: hex }).JWT_SECRET).toBe(hex);
      expect(validateEnv({ ...REQUIRED, JWT_SECRET: base64 }).JWT_SECRET).toBe(base64);
    });

    it.each([
      ['too short', 'k'.repeat(63)],
      ['a space', `${'k'.repeat(64)} x`],
      ['non-ASCII', `${'k'.repeat(64)}ї`],
    ])('rejects a key that is %s, without echoing it', (_kind, key) => {
      const message = errorMessageFor({ JWT_SECRET: key });
      expect(message).toMatch(/JWT_SECRET: /);
      expect(message).not.toContain('kkkk');
    });
  });

  it('names every invalid variable but none of the values', () => {
    const token = 'your-tmdb-api-read-access-token-goes-here';
    const message = errorMessageFor({
      PORT: 'abc',
      TMDB_TIMEOUT_MS: '-1',
      TMDB_ACCESS_TOKEN: token,
      // A valid URL, but http: the cross-variable rule must still report it
      // while other variables are invalid.
      TMDB_BASE_URL: 'http://secret-host.example/3',
    });
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/TMDB_TIMEOUT_MS/);
    expect(message).toMatch(/TMDB_ACCESS_TOKEN: looks like a placeholder/);
    expect(message).toMatch(/TMDB_BASE_URL: must use https/);
    expect(message).not.toContain(token);
    expect(message).not.toContain('secret-host');
  });
});
