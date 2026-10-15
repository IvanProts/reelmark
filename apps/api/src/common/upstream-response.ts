/**
 * Helpers shared by the upstream HTTP clients (TMDB, Wikidata). Upstream responses are untrusted:
 * bodies are size-capped while downloading, and failure reasons never quote request or response
 * data.
 */

/**
 * Reads the body as UTF-8 text, but stops downloading and returns undefined as
 * soon as it exceeds `maxBytes`. `response.json()` would buffer whatever the
 * server sends, however large.
 */
export async function readTextUpTo(
  response: Response,
  maxBytes: number,
): Promise<string | undefined> {
  // Cheap early exit when the server announces the size up front.
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) {
    return ''; // e.g. 204 No Content
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * A short, safe reason for a failed `fetch()`. Never `error.message`: Node's
 * fetch errors can quote request headers, including tokens.
 */
export function describeFetchError(error: unknown, timeoutMs: number): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }
  if (error.name === 'TimeoutError') {
    return `timed out after ${timeoutMs} ms`;
  }
  // Node's fetch throws `TypeError: fetch failed` and puts the real reason
  // (ECONNREFUSED, ENOTFOUND, …) into `cause.code`.
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? `network error (${code})` : `network error (${error.name})`;
}
