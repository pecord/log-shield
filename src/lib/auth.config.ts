import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

// Edge-safe config — no Credentials provider here (it requires Node.js
// modules via Prisma). The Credentials provider is added in auth.ts which
// only runs in the Node.js runtime.
export default {
  providers: [
    GitHub({ allowDangerousEmailAccountLinking: true }),
    Google({ allowDangerousEmailAccountLinking: true }),
  ],
  pages: {
    signIn: "/signin",
    error: "/auth/error",
  },
} satisfies NextAuthConfig;
