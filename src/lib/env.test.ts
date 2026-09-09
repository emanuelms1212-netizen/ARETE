import { describe, expect, it } from 'vitest';
import { EnvironmentError, parseEnv } from './env';

const valid = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_MODE: 'demo',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_ANALYTICS_SINK: 'off',
};

describe('parseEnv', () => {
  it('accepts a demo-mode environment with no credentials', () => {
    expect(parseEnv(valid).NEXT_PUBLIC_APP_MODE).toBe('demo');
  });

  it('defaults to demo mode when nothing is set', () => {
    const env = parseEnv({});

    expect(env.NEXT_PUBLIC_APP_MODE).toBe('demo');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });

  it('refuses live mode until the persistence adapter exists', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_APP_MODE: 'live' })).toThrow(EnvironmentError);
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_APP_MODE: 'live' })).toThrow(/stage 4/);
  });

  it('rejects an unknown app mode instead of guessing', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_APP_MODE: 'production' })).toThrow(
      EnvironmentError,
    );
  });

  it('rejects a malformed app URL', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow(
      EnvironmentError,
    );
  });

  it('names the offending variable in the message', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'nope' })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
  });
});
