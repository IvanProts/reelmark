/**
 * The anonymous session. The refresh token lives in secure storage (Keychain / Keystore); the
 * short-lived access token lives only in memory. Tokens are never logged.
 */
import * as SecureStore from 'expo-secure-store';

import { AuthTokensSchema, RefreshTokenSchema, type AuthTokens } from '@reelmark/shared';

import { ApiError, request, type RequestOptions, type SchemaOption } from './http';

const REFRESH_TOKEN_KEY = 'reelmark.refreshToken';
// Readable only while the device is unlocked, and never restored onto another device.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let accessToken: string | null = null;
/** The token request in flight, shared by every caller that needs a token right now. */
let pendingAccessToken: Promise<string> | null = null;
const replacedListeners = new Set<() => void>();

/** A request to `/api/v1<path>` with the access token, signing in first when needed. */
export function authorizedRequest<T>(
  path: string,
  options: RequestOptions & SchemaOption<T>,
): Promise<T>;
export function authorizedRequest(path: string, options?: RequestOptions): Promise<void>;
export async function authorizedRequest<T>(
  path: string,
  options: RequestOptions & Partial<SchemaOption<T>> = {},
): Promise<T | void> {
  const send = (token: string) =>
    options.schema
      ? request(path, { ...options, schema: options.schema, token })
      : request(path, { ...options, token });

  const token = accessToken ?? (await getAccessToken());
  try {
    return await send(token);
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    // The access token expired. Drop it unless a concurrent request has already replaced
    // it, then retry once with a fresh one.
    if (accessToken === token) accessToken = null;
    return send(accessToken ?? (await getAccessToken()));
  }
}

/** Forgets the session on this device; the next request starts a new anonymous one. */
export async function endSession(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, STORE_OPTIONS);
}

/**
 * Called when the server rejected the stored session and a new anonymous account replaced it,
 * so cached data that belonged to the old account can be dropped. Returns an unsubscribe.
 */
export function onSessionReplaced(listener: () => void): () => void {
  replacedListeners.add(listener);
  return () => replacedListeners.delete(listener);
}

/**
 * Single flight: concurrent callers share one token request, so a refresh token (which the
 * server rotates on every use) is never sent twice.
 */
function getAccessToken(): Promise<string> {
  pendingAccessToken ??= startSession().finally(() => {
    pendingAccessToken = null;
  });
  return pendingAccessToken;
}

async function startSession(): Promise<string> {
  const stored = await readRefreshToken();
  let tokens: AuthTokens;
  if (stored) {
    try {
      tokens = await request('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: stored },
        schema: AuthTokensSchema,
      });
    } catch (error) {
      // Only a definite rejection ends the session; a network error must never wipe it.
      if (!isUnauthorized(error)) throw error;
      // TODO(backlog): with Sign in with Apple / Google, offer to sign in instead of starting over.
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, STORE_OPTIONS);
      tokens = await createAnonymousSession();
      replacedListeners.forEach((listener) => listener());
    }
  } else {
    tokens = await createAnonymousSession();
  }
  // Store the rotated refresh token before using the access token: the old one is now spent.
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken, STORE_OPTIONS);
  accessToken = tokens.accessToken;
  return tokens.accessToken;
}

function createAnonymousSession(): Promise<AuthTokens> {
  return request('/auth/anonymous', { method: 'POST', schema: AuthTokensSchema });
}

/** The stored refresh token, or null when there is none or it isn't well-formed. */
async function readRefreshToken(): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY, STORE_OPTIONS);
  if (stored === null) return null;
  if (RefreshTokenSchema.safeParse(stored).success) return stored;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, STORE_OPTIONS);
  return null;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'unauthorized';
}
