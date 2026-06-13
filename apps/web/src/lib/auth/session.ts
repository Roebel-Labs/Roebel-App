import { cookies } from "next/headers";

export interface SessionData {
  username: string;
  createdAt: number;
}

const SESSION_COOKIE_NAME = "dashboard-session";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/**
 * Resolve the signing secret. Required in production; a dev-only fallback
 * keeps local development working without extra setup.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set (must be >= 16 chars). Refusing to issue/verify sessions."
    );
  }
  // Dev-only fallback so local development works out of the box.
  return "dev-insecure-session-secret-change-me";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Sign session data into a tamper-proof token: `<payloadB64Url>.<sigB64Url>`.
 * Uses Web Crypto so it works in both the Node and Edge (middleware) runtimes.
 */
export async function signSession(data: SessionData): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(data)));
  const key = await getKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verify a signed session token and return its data, or null if the
 * signature is invalid or the session has expired. Pure (no cookie access),
 * so it is safe to call from Edge middleware.
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionData | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sig),
      new TextEncoder().encode(payload)
    );
    if (!valid) return null;

    const data = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload))
    ) as SessionData;

    if (Date.now() - data.createdAt > SESSION_DURATION) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Create a new session and set the signed cookie.
 */
export async function createSession(username: string): Promise<void> {
  const sessionData: SessionData = {
    username,
    createdAt: Date.now(),
  };

  const token = await signSession(sessionData);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION / 1000, // Convert to seconds
    path: "/",
  });
}

/**
 * Get the current session data (verifies the signature).
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  const data = await verifySessionToken(sessionCookie?.value);
  if (!data) {
    // Clear any invalid/expired cookie.
    if (sessionCookie) await destroySession();
    return null;
  }
  return data;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Destroy the current session
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { SESSION_COOKIE_NAME };
