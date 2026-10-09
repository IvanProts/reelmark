import { inspect } from 'node:util';

export interface CapturedOutput {
  /** Everything written so far, as one string. */
  text(): string;
  clear(): void;
  restore(): void;
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

function toText(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString('utf8');
  }
  return inspect(chunk);
}

/**
 * Swallows and records all process output: `process.stdout.write`,
 * `process.stderr.write` (where Nest's ConsoleLogger writes) and every
 * `console.*` method. Used to assert that secrets never reach any log.
 */
export function captureOutput(): CapturedOutput {
  const chunks: string[] = [];

  const writeSpies = [process.stdout, process.stderr].map((stream) =>
    vi.spyOn(stream, 'write').mockImplementation(((chunk: unknown) => {
      chunks.push(toText(chunk));
      return true;
    }) as typeof stream.write),
  );
  const consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      chunks.push(`${args.map(toText).join(' ')}\n`);
    }),
  );

  return {
    text: () => chunks.join(''),
    clear: () => {
      chunks.length = 0;
    },
    restore: () => {
      for (const spy of [...writeSpies, ...consoleSpies]) {
        spy.mockRestore();
      }
    },
  };
}
