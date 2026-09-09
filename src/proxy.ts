import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/** Optimistic auth redirect only; real authorization happens server-side per action. */
export function proxy(request: NextRequest) {
  return auth(request as never);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webmanifest)).*)"],
};
