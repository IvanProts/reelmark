import { loggablePath } from './all-exceptions.filter.js';

describe('loggablePath', () => {
  it('drops the query string and the fragment', () => {
    expect(loggablePath('/api/v1/movies/deck?page=2&secret=x')).toBe('/api/v1/movies/deck');
    expect(loggablePath('/api/v1/health#x?y')).toBe('/api/v1/health');
  });

  it('cuts paths longer than 200 characters', () => {
    const logged = loggablePath(`/api/${'a'.repeat(500)}?q=1`);
    expect(logged).toBe(`/api/${'a'.repeat(195)}…`);
  });

  it('keeps a short path as is', () => {
    expect(loggablePath('/api/v1/health')).toBe('/api/v1/health');
  });
});
