import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { checkRateLimit } from "@/lib/rate-limit";
import { unauthenticated } from "@/lib/errors";

const credentialsSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        if (!checkRateLimit(`signin:${email}`, 10, 15 * 60_000)) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.deletedAt) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
});

/** Current user id or throws. Use inside server actions / route handlers. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw unauthenticated();
  return id;
}

export async function currentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findFirst({ where: { id, deletedAt: null } });
}
