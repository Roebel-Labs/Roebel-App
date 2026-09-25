// Shared HTTP helpers for /api/chat/* (Bearer chat-session auth, JSON errors).
import { NextResponse } from "next/server";
import { bearerToken, verifySessionToken } from "@/lib/chat/session";
import { ChatInputError } from "@/lib/chat/runtime";

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const unauthorized = () =>
  jsonError(401, "unauthorized", "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
export const notFound = (what = "Eintrag") => jsonError(404, "not_found", `${what} wurde nicht gefunden.`);
export const badRequest = (message: string) => jsonError(400, "bad_request", message);

/** Returns the lowercased wallet of a valid chat session, or null. */
export async function requireWallet(request: Request): Promise<string | null> {
  return verifySessionToken(bearerToken(request.headers.get("authorization")));
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Maps thrown errors to the JSON error shape. */
export function handleError(err: unknown, where: string) {
  if (err instanceof ChatInputError) return jsonError(err.status, err.code, err.message);
  console.error(`[api/chat/${where}]`, err);
  return jsonError(500, "internal", "Da ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal.");
}
