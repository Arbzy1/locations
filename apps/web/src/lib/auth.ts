import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [magicLinkClient(), emailOTPClient()],
});

export const { useSession, signIn, signOut, signUp } = authClient;
