import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('rechaza secretos JWT cortos', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x', JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
  it('aplica valores por defecto', () => {
    const env = loadEnv({ DATABASE_URL: 'x', JWT_SECRET: 'a'.repeat(32) });
    expect(env.PORT).toBe(3000);
    expect(env.COOKIE_SECURE).toBe(false);
  });
});
