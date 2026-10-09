import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Fake config for the app under test. With NODE_ENV=test the app ignores
    // apps/api/.env, so the developer's real token is never loaded.
    env: {
      NODE_ENV: 'test',
      TMDB_ACCESS_TOKEN: 'e2e-fake-token-0123456789abcdef0123456789',
    },
  },
});
