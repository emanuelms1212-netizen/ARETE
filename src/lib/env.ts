import { z } from 'zod';

/**
 * Environment validation.
 *
 * Parsed once, eagerly, at module load. A misconfigured environment fails the
 * build or the first request with a readable message rather than surfacing as a
 * mysterious runtime error later.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for full,
 * statically analysable member expressions, so each one is read literally below
 * rather than through a loop or a destructure.
 */
const appModeSchema = z.enum(['demo', 'live']);

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_MODE: appModeSchema.default('demo'),
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.union([z.url(), z.literal('')]).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_ANALYTICS_SINK: z.enum(['off']).default('off'),
});

export type AppMode = z.infer<typeof appModeSchema>;
export type Env = z.infer<typeof rawSchema>;

export class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError';
}

/**
 * Exported for tests. `input` is a plain record so the rules can be exercised
 * without mutating `process.env`.
 */
export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = rawSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new EnvironmentError(`Invalid environment configuration:\n${issues}`);
  }

  const env = result.data;

  if (env.NEXT_PUBLIC_APP_MODE === 'live') {
    throw new EnvironmentError(
      [
        'NEXT_PUBLIC_APP_MODE=live is not supported yet.',
        '',
        'The Supabase-backed persistence adapter arrives in stage 4 of the build',
        '("Data model, authentication, and reliable persistence"). Until it exists,',
        'ARETE refuses to start in live mode rather than quietly serving demo data',
        'as if it were real.',
        '',
        'Set NEXT_PUBLIC_APP_MODE=demo to run the app today.',
      ].join('\n'),
    );
  }

  return env;
}

function readEnv(): Env {
  return parseEnv({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_ANALYTICS_SINK: process.env.NEXT_PUBLIC_ANALYTICS_SINK,
  });
}

export const env: Env = readEnv();

export const isDemoMode = env.NEXT_PUBLIC_APP_MODE === 'demo';
