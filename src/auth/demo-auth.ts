import { DEMO_USER_ID } from '@/persistence/demo-data';
import { AuthNotAvailableError, type AuthProvider, type AuthenticatedUser } from './provider';

const DEMO_USER: AuthenticatedUser = {
  id: DEMO_USER_ID,
  email: null,
  isDemo: true,
};

/**
 * Demo mode's identity.
 *
 * Always the same account, never a real one. Signing in is not merely disabled
 * but refused with an explanation, because a sign-in form that silently does
 * nothing is exactly the kind of dead control the build rules forbid.
 */
export function createDemoAuthProvider(): AuthProvider {
  return {
    kind: 'demo',
    async getCurrentUser() {
      return DEMO_USER;
    },
    async signInWithEmail() {
      throw new AuthNotAvailableError(
        'Demo mode has no accounts. Set NEXT_PUBLIC_APP_MODE=live with Supabase configured to sign in.',
      );
    },
    async signOut() {
      // Nothing to sign out of.
    },
  };
}
