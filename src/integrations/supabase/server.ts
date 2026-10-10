import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * The Supabase client for server components and route handlers.
 *
 * Supabase is used here for **authentication only**. Data access goes through
 * `src/persistence`, straight to Postgres, so that the SQL the tests prove is
 * the SQL production runs.
 *
 * This client carries the anon key, which is a public value: it identifies the
 * project, it does not grant access. Row-level security is what grants access.
 */
export async function createSupabaseServerClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured; this is only reachable in live mode');
  }

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session instead; ignoring this is the
          // documented pattern rather than a swallowed error.
        }
      },
    },
  });
}
