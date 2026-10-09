import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/** What a fake upstream received. */
export interface RecordedRequest {
  method: string;
  /** Raw request target, e.g. "/3/discover/movie?page=1". */
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * A tiny HTTP server on 127.0.0.1 with a swappable handler. It records every
 * request (method, target, headers, body) so tests can assert exactly what our
 * API sent upstream. Used as a stand-in for TMDB and for a "redirect target".
 */
export class FakeHttpServer {
  readonly requests: RecordedRequest[] = [];
  private readonly server: Server;

  constructor(public handler: Handler) {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        this.requests.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        this.handler(req, res);
      });
    });
  }

  /** Starts listening on a random free port; returns the origin. */
  async start(): Promise<string> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  /** Closes the server, including requests that were left hanging. */
  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  reset(handler: Handler): void {
    this.requests.length = 0;
    this.handler = handler;
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'content-type': 'text/plain', ...headers });
  res.end(text);
}
