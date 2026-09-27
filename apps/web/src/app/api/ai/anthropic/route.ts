import { requireWallet } from "../../chat/_lib/http";
import { ANTHROPIC_RATE_RULES, handleAnthropicProxy } from "@/lib/ai-proxy/anthropic";
import { sharedLimiters } from "@/lib/rate-limit/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const limiters = sharedLimiters(ANTHROPIC_RATE_RULES);

/**
 * POST /api/ai/anthropic — Anthropic Messages proxy for the Expo app.
 * Auth: chat-session Bearer token. Body/response: the Anthropic Messages API, passed through.
 */
export async function POST(request: Request) {
  return handleAnthropicProxy(request, {
    authenticate: requireWallet,
    limiters,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}
