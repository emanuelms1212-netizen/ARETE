import { describe, expect, it } from 'vitest';
import { EnvironmentError, parseEnv } from './env';

const demo = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_MODE: 'demo',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_ANALYTICS_SINK: 'off',
};

const live = {
  ...demo,
  NEXT_PUBLIC_APP_MODE: 'live',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  DATABASE_URL: 'postgresql://anon:pw@db.example:6543/postgres',
};

describe('parseEnv', () => {
  it('accepts a demo-mode environment with no credentials', () => {
    expect(parseEnv(demo).NEXT_PUBLIC_APP_MODE).toBe('demo');
  });

  it('defaults to demo mode when nothing is set', () => {
    const env = parseEnv({});

    expect(env.NEXT_PUBLIC_APP_MODE).toBe('demo');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });

  it('accepts live mode once it is fully configured', () => {
    expect(parseEnv(live).NEXT_PUBLIC_APP_MODE).toBe('live');
  });

  it('refuses live mode that is only half configured, and names what is missing', () => {
    for (const missing of [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'DATABASE_URL',
    ] as const) {
      const partial: Record<string, string | undefined> = { ...live };
      delete partial[missing];

      expect(() => parseEnv(partial)).toThrow(EnvironmentError);
      expect(() => parseEnv(partial)).toThrow(new RegExp(missing));
    }
  });

  it('refuses a service-role connection on the request path', () => {
    expect(() =>
      parseEnv({ ...live, DATABASE_URL: 'postgresql://service_role:pw@db.example:5432/postgres' }),
    ).toThrow(/row-level security/);
  });

  it('rejects an unknown app mode instead of guessing', () => {
    expect(() => parseEnv({ ...demo, NEXT_PUBLIC_APP_MODE: 'production' })).toThrow(
      EnvironmentError,
    );
  });

  it('rejects a malformed app URL', () => {
    expect(() => parseEnv({ ...demo, NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow(EnvironmentError);
  });

  it('names the offending variable in the message', () => {
    expect(() => parseEnv({ ...demo, NEXT_PUBLIC_APP_URL: 'nope' })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
