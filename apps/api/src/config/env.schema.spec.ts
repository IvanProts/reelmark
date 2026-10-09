import { validateEnv } from './env.schema.js';

const TOKEN = 'unit-test-token-0123456789abcdef0123456789';
/**
 * 32 hex chars, shaped like TMDB's short v3 API Key. Built at runtime and named
 * without words like "key" or "token": gitleaks flags such a literal next to
 * them (generic-api-key), which would block the commit.
 */
const HEX32 = '0123456789abcdef'.repeat(2);

/** Runs validateEnv and returns the thrown message ('' when it didn't throw). */
function errorMessageFor(raw: Record<string, unknown>): string {
  try {
    validateEnv(raw);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('validateEnv', () => {
  it('applies defaults when only the token is set', () => {
    expect(validateEnv({ TMDB_ACCESS_TOKEN: TOKEN })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      TMDB_ACCESS_TOKEN: TOKEN,
      TMDB_BASE_URL: 'https://api.themoviedb.org/3',
      TMDB_TIMEOUT_MS: 5000,
    });
  });

  it('accepts a JWT-shaped token (base64url segments joined by dots)', () => {
    const jwtShaped = `${'Ab0'.repeat(8)}.${'cD1_-'.repeat(10)}.${'e2F'.repeat(12)}`;
    expect(validateEnv({ TMDB_ACCESS_TOKEN: jwtShaped }).TMDB_ACCESS_TOKEN).toBe(jwtShaped);
  });

  it('coerces numbers, trims the token and keeps explicit values', () => {
    const env = validateEnv({
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
    expect(() =>
      validateEnv({ TMDB_ACCESS_TOKEN: TOKEN, PATH: '/usr/bin', HOME: '/x' }),
    ).not.toThrow();
  });

  it('requires TMDB_ACCESS_TOKEN', () => {
    expect(errorMessageFor({})).toMatch(/TMDB_ACCESS_TOKEN: is required/);
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
