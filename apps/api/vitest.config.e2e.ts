import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

import { TEST_DATABASE_URL, TEST_SIGNING_KEY } from './test/support/test-env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    // The suites share one database and reset it, so they must not run concurrently.
    fileParallelism: false,
    // Fake config for the app under test. With NODE_ENV=test the app ignores
    // apps/api/.env, so the developer's real secrets are never loaded.
    env: {
      NODE_ENV: 'test',
      TMDB_ACCESS_TOKEN: 'e2e-fake-token-0123456789abcdef0123456789',
      // Unreachable (discard port), so no suite can ever query the real Wikidata.
      WIKIDATA_SPARQL_URL: 'http://127.0.0.1:9/sparql',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: TEST_SIGNING_KEY,
    },
  },
});
