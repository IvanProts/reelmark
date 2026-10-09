/** HTTP client for our API: timeouts, contract validation and user-facing error kinds. */
import {
  DeckQuerySchema,
  DeckResponseSchema,
  type DeckResponse,
  type Locale,
} from '@reelmark/shared';

/** Give up on a request after this long; the UI then shows "server unreachable". */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * What went wrong, from the user's point of view:
 * - `unreachable`: no response at all (offline, server down, timeout)
 * - `server`: the server answered with a non-2xx status
 * - `invalid-response`: a 2xx answer that doesn't match the contract
 * - `config`: the app itself is misconfigured (missing or invalid API URL)
 */
type ApiErrorKind = 'unreachable' | 'server' | 'invalid-response' | 'config';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, only for `server` errors. */
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Base URL of our API, e.g. `http://localhost:3000`.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the bundle at build time, so the value is
 * public. Expo only inlines this exact spelling: no destructuring, no bracket access.
 */
function getApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!url) {
    throw new ApiError(
      'config',
      'EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env and restart Expo.',
    );
  }
  if (!/^https?:\/\//.test(url)) {
    throw new ApiError('config', 'EXPO_PUBLIC_API_URL must start with http:// or https://');
  }
  // Plain http is for local development only; release builds must encrypt traffic.
  if (!__DEV__ && !url.startsWith('https://')) {
    throw new ApiError('config', 'EXPO_PUBLIC_API_URL must use https:// in release builds');
  }
  // Without the trailing slash, paths never become `...3000//api`.
  return url.replace(/\/+$/, '');
}

/**
 * `GET /api/v1/movies/deck?page=N&lang=uk`: one page of cards, localised to `lang`.
 * `signal` is TanStack Query's cancellation signal (e.g. when the screen unmounts).
 */
export async function fetchDeck(
  page: number,
  lang: Locale,
  signal?: AbortSignal,
): Promise<DeckResponse> {
  // Our own input goes through the shared contract too (page 1–500, supported language).
  const query = DeckQuerySchema.parse({ page, lang });
  const url = `${getApiUrl()}/api/v1/movies/deck?page=${query.page}&lang=${query.lang}`;

  // `fetch` has no built-in timeout.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onCancel = () => controller.abort();
  signal?.addEventListener('abort', onCancel);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new ApiError('unreachable', `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      // Cancelled by TanStack Query: not a failure, so rethrow as is.
      if (signal?.aborted) throw error;
      // `fetch` rejects only when there is no HTTP response at all.
      throw new ApiError('unreachable', 'Network request failed');
    }

    if (!response.ok) {
      // The error body is neither read nor logged: the UI doesn't need it, and logs must
      // never carry server internals.
      throw new ApiError(
        'server',
        `Server responded with HTTP ${response.status}`,
        response.status,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      if (timedOut) {
        throw new ApiError('unreachable', `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw new ApiError('invalid-response', 'Response body is not valid JSON');
    }

    // Never trust the network: check the shape against the shared contract.
    const result = DeckResponseSchema.safeParse(json);
    if (!result.success) {
      if (__DEV__) {
        // Paths and issue codes only, never the response data.
        const issues = result.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.')}: ${issue.code}`);
        console.warn('[api] Deck response does not match the contract:', issues);
      }
      throw new ApiError('invalid-response', 'Response does not match DeckResponseSchema');
    }
    return result.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}
