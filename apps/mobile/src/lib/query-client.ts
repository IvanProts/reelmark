import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api';

/**
 * The app's server-data cache. A module-level singleton is fine here: a mobile app has one
 * user and no server-side rendering, so there is nothing to isolate per request.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry once for errors that may be temporary (network, 5xx); retrying a malformed
      // response or a misconfiguration can't help.
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          (error.kind === 'invalid-response' || error.kind === 'config')
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});
