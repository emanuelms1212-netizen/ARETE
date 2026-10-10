import { createSupabaseServerClient } from '@/integrations/supabase/server';
import type { AuthProvider, AuthenticatedUser } from './provider';

/**
 * Live authentication.
 *
 * Email link plus one social provider is the MVP set (PRODUCT_SPEC §9). Account
 * deletion is not here: it is `delete_my_account()` in the database, so that it
 * cannot be a request that an application server forgets to finish.
 */
export function createSupabaseAuthProvider(): AuthProvider {
  return {
    kind: 'supabase',

    async getCurrentUser(): Promise<AuthenticatedUser | null> {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;

      return { id: data.user.id, email: data.user.email ?? null, isDemo: false };
    },

    async signInWithEmail(email: string) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
    },

    async signOut() {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    },
  };
}
