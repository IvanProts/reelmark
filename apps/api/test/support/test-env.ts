/**
 * Configuration for the e2e suites. The database credentials are fixed and public (see
 * infra/postgres/init and the CI workflow): they reach only the throwaway reelmark_test database
 * on 127.0.0.1.
 */
export const TEST_DATABASE_URL =
  'postgresql://reelmark_test:reelmark_test@127.0.0.1:5432/reelmark_test';

/** Signs the test app's access tokens; matches the JWT_SECRET rules (64+ characters). */
export const TEST_SIGNING_KEY = 'e2e-only-signing-material-0123456789'.repeat(2);
