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
  /**
   * Request-scoped Postgres connection, used by the repository. Must be a role
   * that row-level security applies to — never the service role.
   */
  DATABASE_URL: z.string().optional(),
  /** Migrations and the seed only. Bypasses row-level security. Never sent to the browser. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_ANALYTICS_SINK: z.enum(['off']).default('off'),
});

export type AppMode = z.infer<typeof appModeSchema>;
export type Env = z.infer<typeof rawSchema>;

export class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError';
}

function present(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
    const missing = [
      present(env.NEXT_PUBLIC_SUPABASE_URL) ? null : 'NEXT_PUBLIC_SUPABASE_URL',
      present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? null : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      present(env.DATABASE_URL) ? null : 'DATABASE_URL',
    ].filter((name): name is string => name !== null);

    if (missing.length > 0) {
      throw new EnvironmentError(
        [
          'NEXT_PUBLIC_APP_MODE=live needs a database, and these are missing:',
          ...missing.map((name) => `  - ${name}`),
          '',
          'ARETE refuses to start in live mode half-configured rather than serving',
          'demo data as if it were the account. Set NEXT_PUBLIC_APP_MODE=demo to run',
          'without any credentials.',
        ].join('\n'),
      );
    }

    // The service role bypasses row-level security entirely. It belongs to
    // migrations and the seed, never to the request path, and it must never be
    // the connection the app reads user data through.
    if (present(env.DATABASE_URL) && env.DATABASE_URL.includes('service_role')) {
      throw new EnvironmentError(
        'DATABASE_URL looks like a service-role connection. That bypasses row-level ' +
          'security, so it must not be what the app serves requests with.',
      );
    }
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
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_ANALYTICS_SINK: process.env.NEXT_PUBLIC_ANALYTICS_SINK,
  });
}

export const env: Env = readEnv();

export const isDemoMode = env.NEXT_PUBLIC_APP_MODE === 'demo';
