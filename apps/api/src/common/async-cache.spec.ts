import { AsyncCache } from './async-cache.js';

/** A load() whose result the test controls; counts its calls. */
function controllableLoad<V>() {
  const settlers: {
    resolve: (value: V) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const load = vi.fn(
    () =>
      new Promise<V>((resolve, reject) => {
        settlers.push({ resolve, reject });
      }),
  );
  return { load, settlers };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AsyncCache', () => {
  it('loads once, then serves the stored value until it expires', async () => {
    const cache = new AsyncCache<string>({ ttlMs: 1_000, maxEntries: 10 });
    const load = vi.fn(() => Promise.resolve('v1'));

    expect(await cache.get('k', load)).toBe('v1');
    vi.advanceTimersByTime(999);
    expect(await cache.get('k', load)).toBe('v1');
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    load.mockResolvedValue('v2');
    expect(await cache.get('k', load)).toBe('v2');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const cache = new AsyncCache<string>({ ttlMs: 1_000, maxEntries: 10 });
    const { load, settlers } = controllableLoad<string>();

    const calls = [cache.get('k', load), cache.get('k', load)];
    settlers[0]?.resolve('shared');

    expect(await Promise.all(calls)).toEqual(['shared', 'shared']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares a failing in-flight load too, and does not cache the failure by default', async () => {
    const cache = new AsyncCache<string>({ ttlMs: 1_000, maxEntries: 10 });
    const { load, settlers } = controllableLoad<string>();

    const calls = [cache.get('k', load), cache.get('k', load)];
    settlers[0]?.reject(new Error('boom'));

    for (const call of calls) {
      await expect(call).rejects.toThrow('boom');
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);

    const retry = cache.get('k', load);
    settlers[1]?.resolve('ok');
    expect(await retry).toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('remembers a failure for failureTtlMs when configured', async () => {
    const cache = new AsyncCache<string>({
      ttlMs: 1_000,
      maxEntries: 10,
      failureTtlMs: 100,
    });
    const load = vi.fn((): Promise<string> => Promise.reject(new Error('boom')));

    await expect(cache.get('k', load)).rejects.toThrow('boom');
    vi.advanceTimersByTime(99);
    await expect(cache.get('k', load)).rejects.toThrow('boom');
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    load.mockResolvedValue('ok');
    expect(await cache.get('k', load)).toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry once maxEntries is reached', async () => {
    const cache = new AsyncCache<string>({ ttlMs: 1_000, maxEntries: 2 });
    const load = vi.fn((key: string) => Promise.resolve(key));

    await cache.get('a', () => load('a'));
    await cache.get('b', () => load('b'));
    await cache.get('c', () => load('c')); // evicts "a"
    expect(cache.size).toBe(2);

    await cache.get('b', () => load('b')); // still cached
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get('a', () => load('a')); // reloaded, evicts "b"
    expect(load).toHaveBeenCalledTimes(4);
    await cache.get('c', () => load('c')); // still cached
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('counts a refreshed entry as the newest', async () => {
    const cache = new AsyncCache<string>({ ttlMs: 1_000, maxEntries: 2 });
    const load = vi.fn((key: string) => Promise.resolve(key));

    await cache.get('a', () => load('a'));
    await cache.get('b', () => load('b'));
    vi.advanceTimersByTime(1_000); // both expire
    await cache.get('a', () => load('a')); // reloaded → newest
    await cache.get('c', () => load('c')); // evicts "b", the oldest now

    await cache.get('a', () => load('a'));
    expect(load).toHaveBeenCalledTimes(4); // "a" was still cached
  });
});
