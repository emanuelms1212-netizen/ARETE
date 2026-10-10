import { env } from '@/lib/env';
import { createDemoAuthProvider } from './demo-auth';
import { createSupabaseAuthProvider } from './supabase-auth';
import type { AuthProvider, AuthenticatedUser } from './provider';

let provider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  provider ??=
    env.NEXT_PUBLIC_APP_MODE === 'demo' ? createDemoAuthProvider() : createSupabaseAuthProvider();
  return provider;
}

/** The signed-in user, or null. Demo mode always answers with the demo account. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  return getAuthProvider().getCurrentUser();
}

export { AuthNotAvailableError } from './provider';
export type { AuthProvider, AuthenticatedUser } from './provider';
