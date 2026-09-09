import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe part of the Auth.js config (no Prisma import) so `proxy.ts` can
 * run optimistic redirects. Full config with the Credentials provider lives in
 * `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected = pathname.startsWith("/w/") || pathname.startsWith("/onboarding") || pathname.startsWith("/invite/");
      if (isProtected && !auth?.user) return false;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
