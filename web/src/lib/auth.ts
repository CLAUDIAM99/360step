import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const inferredUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;

if (!process.env.NEXTAUTH_URL && inferredUrl) {
  process.env.NEXTAUTH_URL = inferredUrl;
}

export const authOptions: NextAuthOptions = {
  // For previews, Vercel provides VERCEL_URL; infer NEXTAUTH_URL if missing.
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

