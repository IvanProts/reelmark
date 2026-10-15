import { z } from 'zod';

/**
 * Environment variables, validated once at boot via `ConfigModule.forRoot`.
 * Error messages name the variable but never its value: several values are secrets.
 */

/** TMDB read access tokens are long JWTs; anything this short is a mistake. */
const MIN_TOKEN_LENGTH = 32;

/** Obvious "fill me in" values copied from templates or docs. */
const PLACEHOLDER_TOKEN =
  /^(?:<.*>|\[.*\]|\{.*\}|x+|\*+|\.+|todo|placeholder|change[-_ ]?me|replace[-_ ]?me|your[-_ ].*)$/i;

/**
 * A TMDB read access token is a JWT: base64url segments joined by dots.
 * Anything else (spaces, newlines, invisible characters) can't go into an
 * HTTP header and would make every TMDB call fail with an opaque error.
 */
const TOKEN_CHARSET = /^[A-Za-z0-9._-]+$/;

/** TMDB's short v3 "API Key" (32 hex chars) — a common mix-up with the read access token. */
const TMDB_V3_API_KEY = /^[0-9a-f]{32}$/i;

/** 32 random bytes, written as hex or base64, take at least 64 characters. */
const MIN_JWT_SECRET_LENGTH = 64;

/** Hex, base64 and base64url alphabets. */
const JWT_SECRET_CHARSET = /^[A-Za-z0-9+/=_-]+$/;

/** Plain-http upstreams allowed in tests, so they can run fake TMDB and Wikidata servers locally. */
const LOCAL_TEST_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Per-variable rules. Env values are strings, so numbers are coerced. */
const EnvFields = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 127.0.0.1: only this machine can reach the API.
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  TMDB_ACCESS_TOKEN: z
    .string({ error: 'is required' })
    .trim()
    .min(MIN_TOKEN_LENGTH, {
      error: 'is too short to be a TMDB "API Read Access Token"',
      abort: true, // the checks below are pointless for a short value
    })
    .regex(TOKEN_CHARSET, {
      error: 'contains characters a token cannot have (allowed: letters, digits, ".", "_", "-")',
    })
    .refine((token) => !PLACEHOLDER_TOKEN.test(token), {
      error: 'looks like a placeholder, not a real token',
    })
    .refine((token) => !TMDB_V3_API_KEY.test(token), {
      error: 'looks like the short v3 "API Key"; use the long "API Read Access Token" instead',
    }),

  TMDB_BASE_URL: z
    .url({ protocol: /^https?$/, error: 'must be a valid http(s) URL' })
    // Request paths are appended to this string, so a "?" or "#" would swallow
    // them and every call would silently hit the base URL; credentials in a URL
    // end up in logs. Checked on the raw text because a bare "?" or "#" parses
    // to an empty `search`/`hash`.
    .refine(isPlainBaseUrl, {
      error: 'must not contain credentials, a query ("?") or a fragment ("#")',
    })
    .default('https://api.themoviedb.org/3'),
  TMDB_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),

  // Wikidata's public SPARQL endpoint, for critics' scores. Only tests point it elsewhere.
  WIKIDATA_SPARQL_URL: z
    .url({ protocol: /^https?$/, error: 'must be a valid http(s) URL' })
    // The client sets the query string itself.
    .refine(isPlainBaseUrl, {
      error: 'must not contain credentials, a query ("?") or a fragment ("#")',
    })
    .default('https://query.wikidata.org/sparql'),

  DATABASE_URL: z
    .string({ error: 'is required' })
    .refine(isPostgresUrl, { error: 'must be a postgresql:// connection URL' }),

  // Signs access tokens (HS256). Anyone who knows it can mint tokens for any user.
  JWT_SECRET: z
    .string({ error: 'is required' })
    .min(MIN_JWT_SECRET_LENGTH, {
      error: `is too short: use at least ${MIN_JWT_SECRET_LENGTH} characters (32 random bytes)`,
      abort: true,
    })
    .regex(JWT_SECRET_CHARSET, {
      error: 'may only contain letters, digits and "+", "/", "=", "_", "-" (hex or base64)',
    }),
});

const HTTPS_REQUIRED = 'must use https (http is allowed only for localhost when NODE_ENV=test)';

const EnvSchema = EnvFields.refine(
  // The token travels in a header, so the upstream must use HTTPS. The only
  // exception is a fake TMDB on localhost during tests.
  (env) => isHttpsOrLocalTest(env.TMDB_BASE_URL, env.NODE_ENV),
  {
    path: ['TMDB_BASE_URL'],
    error: HTTPS_REQUIRED,
    // Zod skips object-level rules while any field is invalid. This rule only
    // needs NODE_ENV and TMDB_BASE_URL, so it runs whenever those two are
    // valid, and a single boot reports every problem.
    when: (payload) =>
      EnvFields.pick({ NODE_ENV: true, TMDB_BASE_URL: true }).safeParse(payload.value).success,
  },
).refine(
  // Scores shown as facts must not be open to tampering in transit.
  (env) => isHttpsOrLocalTest(env.WIKIDATA_SPARQL_URL, env.NODE_ENV),
  {
    path: ['WIKIDATA_SPARQL_URL'],
    error: HTTPS_REQUIRED,
    when: (payload) =>
      EnvFields.pick({ NODE_ENV: true, WIKIDATA_SPARQL_URL: true }).safeParse(payload.value)
        .success,
  },
);

/** HTTPS, or plain http to a fake upstream on localhost when NODE_ENV=test. */
function isHttpsOrLocalTest(value: string, nodeEnv: string): boolean {
  const url = URL.parse(value);
  const isLocalTestUpstream = nodeEnv === 'test' && LOCAL_TEST_HOSTS.has(url?.hostname ?? '');
  return url?.protocol === 'https:' || isLocalTestUpstream;
}

function isPlainBaseUrl(value: string): boolean {
  const url = URL.parse(value);
  if (!url) {
    return true; // not a URL at all: already reported by z.url()
  }
  return !url.username && !url.password && !/[?#]/.test(value);
}

function isPostgresUrl(value: string): boolean {
  const url = URL.parse(value);
  return url?.protocol === 'postgresql:' && url.hostname !== '';
}

/** The validated, typed configuration. Use it as `ConfigService<Env, true>`. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * Validates raw env vars (process.env merged with the .env file) and returns
 * typed config. Throws — which stops the app from booting — when anything is
 * wrong, listing every invalid variable by name.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  // An env file line `FOO=` yields an empty string. Treat it as unset, so
  // defaults apply and required variables report "is required".
  const provided = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));

  const result = EnvSchema.safeParse(provided);
  if (result.success) {
    return result.data;
  }

  // Zod issue messages describe what was expected, never the received value,
  // so this text is safe to print.
  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(
    [
      'Invalid environment configuration:',
      ...problems,
      'Fix apps/api/.env (see apps/api/.env.example for the variables).',
    ].join('\n'),
  );
}
