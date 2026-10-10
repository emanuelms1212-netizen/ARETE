/**
 * Authentication, behind an interface.
 *
 * The app asks "who is this?" and never "what did Supabase say?". Demo mode
 * answers with a fixed identity; live mode answers from the session. Swapping
 * provider later is a change in this directory and nowhere else.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string | null;
  readonly isDemo: boolean;
}

export interface AuthProvider {
  readonly kind: 'demo' | 'supabase';
  /** The signed-in user, or null. Never throws for "not signed in". */
  getCurrentUser(): Promise<AuthenticatedUser | null>;
  /** Sends a sign-in link. Email and one social provider are the MVP set. */
  signInWithEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export class AuthNotAvailableError extends Error {
  override readonly name = 'AuthNotAvailableError';
}
