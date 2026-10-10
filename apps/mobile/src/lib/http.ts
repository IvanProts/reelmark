/** Low-level requests to our API: base URL, timeout, response validation and typed errors. */

/** Give up on a request after this long; the UI then shows "server unreachable". */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * What went wrong, from the user's point of view:
 * - `unreachable`: no response at all (offline, server down, timeout)
 * - `unauthorized`: the server rejected the credentials (HTTP 401)
 * - `server`: any other non-2xx status
 * - `invalid-response`: a 2xx answer that doesn't match the contract
 * - `config`: the app itself is misconfigured (missing or invalid API URL)
 */
type ApiErrorKind = 'unreachable' | 'unauthorized' | 'server' | 'invalid-response' | 'config';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, for `unauthorized` and `server` errors. */
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** The part of a zod schema this module needs, so the app doesn't depend on zod directly. */
export type ResponseSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: SchemaError };
};
type SchemaError = { issues: readonly { path: readonly PropertyKey[]; code: string }[] };

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
  /** Access token for the `Authorization` header. */
  token?: string;
  /** Cancellation from TanStack Query (e.g. the screen unmounted). */
  signal?: AbortSignal;
};

/** With a schema, the response body is validated and returned; without one it is ignored. */
export type SchemaOption<T> = { schema: ResponseSchema<T> };

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

/** Sends one request to `/api/v1<path>` and returns the validated response body. */
export function request<T>(path: string, options: RequestOptions & SchemaOption<T>): Promise<T>;
/** Sends one request to `/api/v1<path>`; the response body is ignored. */
export function request(path: string, options?: RequestOptions): Promise<void>;
export async function request<T>(
  path: string,
  options: RequestOptions & Partial<SchemaOption<T>> = {},
): Promise<T | void> {
  const { method = 'GET', body, token, schema, signal } = options;
  const url = `${getApiUrl()}/api/v1${path}`;

  // `fetch` has no built-in timeout.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onCancel = () => controller.abort();
  signal?.addEventListener('abort', onCancel);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw timeoutError();
      // Cancelled by TanStack Query: not a failure, so rethrow as is.
      if (signal?.aborted) throw error;
      // `fetch` rejects only when there is no HTTP response at all.
      throw new ApiError('unreachable', 'Network request failed');
    }

    // The error body is neither read nor logged: the UI doesn't need it, and logs must
    // never carry server internals.
    if (response.status === 401) {
      throw new ApiError('unauthorized', 'Server responded with HTTP 401', 401);
    }
    if (!response.ok) {
      throw new ApiError(
        'server',
        `Server responded with HTTP ${response.status}`,
        response.status,
      );
    }
    if (!schema) return;

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      if (timedOut) throw timeoutError();
      throw new ApiError('invalid-response', 'Response body is not valid JSON');
    }

    // Never trust the network: check the shape against the shared contract.
    const result = schema.safeParse(json);
    if (!result.success) {
      if (__DEV__) {
        // Paths and issue codes only, never the response data.
        const issues = result.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.map(String).join('.')}: ${issue.code}`);
        console.warn(`[api] ${method} ${path.split('?')[0]} does not match the contract:`, issues);
      }
      throw new ApiError('invalid-response', 'Response does not match the contract');
    }
    return result.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

function timeoutError() {
  return new ApiError('unreachable', `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
}
