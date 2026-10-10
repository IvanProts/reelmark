import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ConsoleLogger, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { captureOutput } from './support/capture-output.js';

/**
 * Booting the real AppModule with invalid configuration fails, names the bad
 * variables and never prints a provided value: not in the thrown error, its
 * stack, or anything Nest logs on the way down.
 *
 * ConfigModule reads `<cwd>/.env` unless NODE_ENV=test, and a developer's env
 * file may hold a real token. Each boot therefore imports AppModule while the
 * process sits in an empty temp directory, and refuses to continue if an env
 * file is visible there. Nothing listens and nothing calls TMDB.
 */

const ENV_KEYS = [
  'NODE_ENV',
  'HOST',
  'PORT',
  'TMDB_ACCESS_TOKEN',
  'TMDB_BASE_URL',
  'TMDB_TIMEOUT_MS',
  'DATABASE_URL',
  'JWT_SECRET',
] as const;

const GOOD_TOKEN = 'boot-fake-token-3c9e1a7b5d2f4e6a8b0c';
/**
 * Shaped like TMDB's short v3 "API Key". Built at runtime and named without
 * words like "token" or "key": gitleaks flags such a literal next to them
 * (generic-api-key), which would block the commit.
 */
const HEX32 = 'abcdef0123456789'.repeat(2);

/** Never connected to: the app only connects on init, and these tests stop after creation. */
const DB_PASSWORD = 'boot-db-pass-4a7c';
/** Valid values for the variables a case doesn't test. */
const REQUIRED_ENV = {
  DATABASE_URL: `postgresql://boot-user:${DB_PASSWORD}@127.0.0.1:5432/boot_db`,
  JWT_SECRET: 'boot-signing-material-'.repeat(4),
};

interface BootResult {
  error: unknown;
  /** The error's message and stack, plus every byte written to stdout, stderr and console. */
  everything: string;
}

async function bootWith(env: Record<string, string>): Promise<BootResult> {
  const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const savedCwd = process.cwd();
  const emptyDir = mkdtempSync(join(tmpdir(), 'env-boot-'));
  const output = captureOutput();
  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    Object.assign(process.env, env);

    process.chdir(emptyDir);
    if (existsSync(resolve(process.cwd(), '.env'))) {
      throw new Error('Refusing to boot: an env file is visible');
    }
    // A fresh copy of app.module: ConfigModule.forRoot() validates the env
    // while the module is evaluated.
    vi.resetModules();
    const { AppModule } = (await import('../src/app.module.js')) as {
      AppModule: Type<unknown>;
    };
    process.chdir(savedCwd);

    let error: unknown;
    try {
      const app = await NestFactory.create(AppModule, {
        abortOnError: false, // rethrow instead of process.exit(1)
        logger: new ConsoleLogger({ colors: false }),
      });
      await app.close();
    } catch (caught) {
      error = caught;
    }
    const errorText = error instanceof Error ? `${error.message}\n${error.stack}` : '';
    return { error, everything: `${errorText}\n${output.text()}` };
  } finally {
    process.chdir(savedCwd);
    output.restore();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    rmSync(emptyDir, { recursive: true, force: true });
  }
}

describe('Boot with invalid configuration', () => {
  it('succeeds with a valid test configuration (control)', async () => {
    const { error, everything } = await bootWith({
      ...REQUIRED_ENV,
      NODE_ENV: 'test',
      TMDB_ACCESS_TOKEN: GOOD_TOKEN,
      TMDB_BASE_URL: 'http://127.0.0.1:9/3',
    });
    expect(error).toBeUndefined();
    expect(everything).not.toContain(DB_PASSWORD);
  });

  it.each<[string, Record<string, string>, string[], string[]]>([
    [
      'a non-numeric PORT',
      { PORT: 'port-value-1f9', TMDB_ACCESS_TOKEN: GOOD_TOKEN },
      ['PORT'],
      ['port-value-1f9', GOOD_TOKEN],
    ],
    [
      'an out-of-range PORT',
      { PORT: '70123', TMDB_ACCESS_TOKEN: GOOD_TOKEN },
      ['PORT'],
      ['70123', GOOD_TOKEN],
    ],
    [
      'a short token',
      { TMDB_ACCESS_TOKEN: 'short-secret-77' },
      ['TMDB_ACCESS_TOKEN'],
      ['short-secret-77'],
    ],
    [
      'a placeholder token',
      { TMDB_ACCESS_TOKEN: 'your-placeholder-token-value-0123456789' },
      ['TMDB_ACCESS_TOKEN: looks like a placeholder'],
      ['placeholder-token-value'],
    ],
    [
      'a v3 API key instead of the token',
      { TMDB_ACCESS_TOKEN: HEX32 },
      ['TMDB_ACCESS_TOKEN'],
      ['abcdef0123456789'],
    ],
    [
      'a token with a character no header can carry',
      { TMDB_ACCESS_TOKEN: `${GOOD_TOKEN} tail-6b0` },
      ['TMDB_ACCESS_TOKEN: contains characters'],
      [GOOD_TOKEN, 'tail-6b0'],
    ],
    [
      'an http TMDB_BASE_URL in production',
      {
        NODE_ENV: 'production',
        TMDB_ACCESS_TOKEN: GOOD_TOKEN,
        TMDB_BASE_URL: 'http://secret-host-a1.internal:8080/3',
      },
      ['TMDB_BASE_URL: must use https'],
      ['secret-host-a1', '8080', GOOD_TOKEN],
    ],
    [
      'an http TMDB_BASE_URL in development, even to localhost',
      {
        NODE_ENV: 'development',
        TMDB_ACCESS_TOKEN: GOOD_TOKEN,
        TMDB_BASE_URL: 'http://127.0.0.1:4011/3',
      },
      ['TMDB_BASE_URL: must use https'],
      ['4011', GOOD_TOKEN],
    ],
    [
      'an http non-local TMDB_BASE_URL in test',
      {
        NODE_ENV: 'test',
        TMDB_ACCESS_TOKEN: GOOD_TOKEN,
        TMDB_BASE_URL: 'http://secret-host-a1.internal/3',
      },
      ['TMDB_BASE_URL'],
      ['secret-host-a1', GOOD_TOKEN],
    ],
    [
      'a TMDB_BASE_URL that is not a URL',
      { TMDB_ACCESS_TOKEN: GOOD_TOKEN, TMDB_BASE_URL: 'not a url 7d3e' },
      ['TMDB_BASE_URL'],
      ['not a url 7d3e', GOOD_TOKEN],
    ],
    [
      'a TMDB_BASE_URL with credentials',
      {
        TMDB_ACCESS_TOKEN: GOOD_TOKEN,
        TMDB_BASE_URL: 'https://user-3f1:pass-8d2@api.themoviedb.org/3',
      },
      ['TMDB_BASE_URL: must not contain credentials'],
      ['user-3f1', 'pass-8d2', GOOD_TOKEN],
    ],
    [
      'a missing DATABASE_URL',
      { TMDB_ACCESS_TOKEN: GOOD_TOKEN, DATABASE_URL: '' },
      ['DATABASE_URL: is required'],
      [GOOD_TOKEN],
    ],
    [
      'a DATABASE_URL for another database engine',
      {
        TMDB_ACCESS_TOKEN: GOOD_TOKEN,
        DATABASE_URL: 'mysql://boot-user:db-pass-5c3e@db-host-9b.internal:3306/app',
      },
      ['DATABASE_URL: must be a postgresql:// connection URL'],
      ['db-pass-5c3e', 'db-host-9b', GOOD_TOKEN],
    ],
    [
      'a short JWT_SECRET',
      { TMDB_ACCESS_TOKEN: GOOD_TOKEN, JWT_SECRET: 'short-signing-6d2' },
      ['JWT_SECRET: is too short'],
      ['short-signing-6d2', GOOD_TOKEN],
    ],
    [
      'a JWT_SECRET with characters outside hex and base64',
      { TMDB_ACCESS_TOKEN: GOOD_TOKEN, JWT_SECRET: 'signing material 8f1 '.repeat(4) },
      ['JWT_SECRET: may only contain'],
      ['signing material 8f1', GOOD_TOKEN],
    ],
    [
      'an unknown NODE_ENV',
      { NODE_ENV: 'staging-e4c1', TMDB_ACCESS_TOKEN: GOOD_TOKEN },
      ['NODE_ENV'],
      ['staging-e4c1', GOOD_TOKEN],
    ],
    [
      'everything wrong at once',
      {
        NODE_ENV: 'production',
        PORT: 'port-value-2b8',
        TMDB_ACCESS_TOKEN: 'your-placeholder-token-value-0123456789',
        TMDB_BASE_URL: 'http://secret-host-a1.internal/3',
        TMDB_TIMEOUT_MS: 'timeout-value-9a1',
      },
      ['PORT', 'TMDB_ACCESS_TOKEN', 'TMDB_BASE_URL', 'TMDB_TIMEOUT_MS'],
      ['port-value-2b8', 'placeholder-token-value', 'secret-host-a1', 'timeout-value-9a1'],
    ],
  ])('fails on %s, naming the variable but no value', async (_name, env, mention, never) => {
    const { error, everything } = await bootWith({ ...REQUIRED_ENV, ...env });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^Invalid environment configuration:/);
    // Positive control: Nest's own boot-failure log line was captured.
    expect(everything).toMatch(/ERROR \[ExceptionHandler\]/);
    for (const text of mention) {
      expect(everything).toContain(text);
    }
    for (const value of [...never, DB_PASSWORD]) {
      expect(everything).not.toContain(value);
    }
  });
});
