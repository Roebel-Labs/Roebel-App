// Shared helpers for /api/muenzen/* routes: admin-session gate, cache-bypass
// detection and a uniform JSON error shape. Server-only.
import "server-only";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";

/**
 * Returns a 401 response if the caller is not an authenticated admin, otherwise
 * null. Middleware only guards /admin/dashboard/* pages — API routes must
 * re-check the session themselves.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** True when the request asked to bypass the cache (`?fresh=1`). */
export function isFresh(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get("fresh") === "1";
  } catch {
    return false;
  }
}

export function getParam(req: Request, key: string): string | null {
  try {
    return new URL(req.url).searchParams.get(key);
  } catch {
    return null;
  }
}

export function jsonError(e: unknown, status = 500): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api/muenzen]", message);
  return NextResponse.json({ error: message }, { status });
}
