// Server wiring for the builder AI budgets (see ./caller.ts for the policy).
import "server-only";
import { bearerToken, verifySessionToken } from "@/lib/chat/session";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { takeAll, type RateLimiter } from "@/lib/rate-limit";
import {
  BUILDER_LIMITS,
  BUILDER_LIMIT_MESSAGE,
  limitKey,
  resolveBuilderCaller,
  type BuilderAiRoute,
  type BuilderCaller,
} from "./caller";

const limiters = new Map<string, RateLimiter[]>();

function limitersFor(kind: BuilderCaller["kind"], route: BuilderAiRoute): RateLimiter[] {
  const id = `${kind}:${route}`;
  let l = limiters.get(id);
  if (!l) {
    l = sharedLimiters(BUILDER_LIMITS[kind][route]);
    limiters.set(id, l);
  }
  return l;
}

/** Verified chat session (Studio / Röbel App) → wallet, else null. */
export function verifyBuilderBearer(authorization: string | null): Promise<string | null> {
  return verifySessionToken(bearerToken(authorization));
}

/**
 * Takes one hit from the caller's budget. Returns a 429 Response when refused, else the caller.
 */
export async function takeBuilderBudget(
  request: Request,
  route: BuilderAiRoute,
): Promise<{ caller: BuilderCaller; refused: null } | { caller: BuilderCaller; refused: Response }> {
  const caller = await resolveBuilderCaller(request.headers, verifyBuilderBearer);
  const ok = await takeAll(limitersFor(caller.kind, route), limitKey(caller));
  if (ok) return { caller, refused: null };
  console.warn(`[mini-apps/${route}] budget refused`, caller.kind);
  return {
    caller,
    refused: Response.json(
      { error: BUILDER_LIMIT_MESSAGE[caller.kind], code: "rate_limited" },
      { status: 429, headers: { "retry-after": "600" } },
    ),
  };
}
