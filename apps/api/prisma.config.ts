import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'prisma/config';

// Configuration for the Prisma CLI (generate, migrate, studio). Prisma 7 doesn't load env files
// itself; variables already set in the environment take precedence, so tests and CI can point the
// CLI at another database.
const envFile = join(import.meta.dirname, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Optional so that `prisma generate` works without a database (fresh clones, CI).
  datasource: { url: process.env.DATABASE_URL },
});
