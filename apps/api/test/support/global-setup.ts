import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { TEST_DATABASE_URL } from './test-env.js';

/**
 * Runs once before the e2e suites: applies every migration to the test database, exactly as a
 * deployment would (`prisma migrate deploy`).
 */
export default function setup(): void {
  if (!new URL(TEST_DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error('Refusing to migrate: the e2e database name must end with "_test"');
  }
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: join(import.meta.dirname, '..', '..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `Could not migrate the test database. Is PostgreSQL running (\`pnpm db:up\`)?\n${output}`,
    );
  }
}
