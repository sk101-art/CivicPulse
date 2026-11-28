import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/auth/rateLimit";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        portal: { label: "Portal", type: "text" }, // "CITIZEN" | "STAFF"
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.trim().toLowerCase();
        const portal = (credentials.portal || "").trim().toUpperCase();

        // 1. Rate Limiting Protection against brute-force attacks
        const rateCheck = checkRateLimit(email);
        if (!rateCheck.allowed) {
          throw new Error(`RATE_LIMITED:${rateCheck.retryAfterSeconds || 60}`);
        }

        // 2. Fetch User from trusted database record
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });

        // Use generic failure if user not found or has no password hash
        if (!user || !user.passwordHash) {
          recordFailedAttempt(email);
          return null;
        }

        // Check if account has been suspended or deactivated
        if (user.isActive === false) {
          throw new Error("ACCOUNT_INACTIVE");
        }

        // 3. Verify Password Hash
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          recordFailedAttempt(email);
          return null;
        }

        // Successful authentication clears rate-limiting
        clearRateLimit(email);

        // 4. Strict Role & Portal Verification (Server-Side Enforced)
        // Never allow a staff account through citizen portal or citizen account through staff portal
        if (portal === "CITIZEN" && user.role !== "CITIZEN") {
          throw new Error("STAFF_ACCOUNT_ON_CITIZEN_PORTAL");
        }

        if (portal === "STAFF" && user.role !== "AUTHORITY") {
          throw new Error("CITIZEN_ACCOUNT_ON_STAFF_PORTAL");
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs to stay on current host/port
      if (url.startsWith("/")) return url;
      try {
        const parsed = new URL(url);
        // Allows callback URLs on the same origin or localhost
        if (parsed.origin === baseUrl || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          return url;
        }
      } catch {
        // Fallback to baseUrl
      }
      return baseUrl;
    },
  },

  pages: {
    signIn: "/login",
  },
};
