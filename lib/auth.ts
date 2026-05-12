import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL ?? '';

const providers: NextAuthConfig['providers'] = [];

// Add Google/Gmail provider only when credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  );
}

export const config: NextAuthConfig = {
  providers,
  callbacks: {
    /**
     * signIn — gate by GitHub login name (for GitHub) or email (for Google).
     * ALLOWED_GH_LOGIN gates GitHub sign-ins; ALLOWED_EMAIL gates all others.
     */
    signIn({ user }) {
      if (!ALLOWED_EMAIL) return true;
      return user.email === ALLOWED_EMAIL;
    },

    /**
     * jwt — called on every sign-in and session read.
     *
     * IMPORTANT: we only SET specific keys based on the provider — we never
     * clear existing keys. This means if the user signs in with GitHub first
     * then signs in with Google, both tokens coexist in the JWT.
     */
    jwt({ token, account }) {
      if (account?.access_token && account.provider === 'google') {
        token.googleAccessToken  = account.access_token;
        token.googleRefreshToken = account.refresh_token;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      const s = session as unknown as Record<string, unknown>;
      s.googleAccessToken  = token.googleAccessToken  ?? null;
      s.googleRefreshToken = token.googleRefreshToken ?? null;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
