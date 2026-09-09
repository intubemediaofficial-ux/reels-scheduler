import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { conflict, validation } from "@/lib/errors";
import { emailProvider } from "@/lib/providers/email";
import { env } from "@/lib/env";

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function registerUser(input: { email: string; password: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with that email already exists.");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await db.user.create({ data: { email, name: input.name.trim(), passwordHash } });
  await audit({ actorId: user.id, action: "auth.signup", targetType: "User", targetId: user.id });
  return user;
}

/** Always resolves (no user enumeration). Sends a reset link when the account exists. */
export async function requestPasswordReset(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return;

  const token = generateOpaqueToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  await audit({ actorId: user.id, action: "auth.password_reset_requested", targetType: "User", targetId: user.id });

  const url = `${env().APP_URL}/reset-password?token=${token}`;
  await emailProvider().send({
    to: email,
    subject: "Reset your Reels Scheduler password",
    text: `Use this link within one hour to reset your password:\n${url}\n\nIf you did not request this, ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw validation("This reset link is invalid or has expired.");
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null, id: { not: record.id } } }),
  ]);
  await audit({ actorId: record.userId, action: "auth.password_reset", targetType: "User", targetId: record.userId });
}
