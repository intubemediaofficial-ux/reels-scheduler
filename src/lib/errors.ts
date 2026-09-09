export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthenticated = () => new AppError("You must be signed in.", "UNAUTHENTICATED");
export const forbidden = (msg = "You do not have permission to do that.") => new AppError(msg, "FORBIDDEN");
export const notFound = (msg = "Not found.") => new AppError(msg, "NOT_FOUND");
export const validation = (msg: string) => new AppError(msg, "VALIDATION");
export const conflict = (msg: string) => new AppError(msg, "CONFLICT");
export const rateLimited = (msg = "Too many requests. Please try again shortly.") =>
  new AppError(msg, "RATE_LIMITED");

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: AppError["code"] | "UNKNOWN" };

/** Wrap a server action so thrown AppErrors become typed results and nothing leaks. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
    if (isRedirectError(e)) throw e;
    console.error("[action]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Please try again.", code: "UNKNOWN" };
  }
}

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
