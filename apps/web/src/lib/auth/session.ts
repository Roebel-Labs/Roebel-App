import { cookies } from "next/headers";

export interface SessionData {
  username: string;
  createdAt: number;
}

const SESSION_COOKIE_NAME = "dashboard-session";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/**
 * Create a new session and set the cookie
 */
export async function createSession(username: string): Promise<void> {
  const sessionData: SessionData = {
    username,
    createdAt: Date.now(),
  };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION / 1000, // Convert to seconds
    path: "/",
  });
}

/**
 * Get the current session data
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    const sessionData: SessionData = JSON.parse(sessionCookie.value);

    // Check if session has expired
    const now = Date.now();
    const sessionAge = now - sessionData.createdAt;

    if (sessionAge > SESSION_DURATION) {
      // Session expired
      await destroySession();
      return null;
    }

    return sessionData;
  } catch {
    // Invalid session data
    await destroySession();
    return null;
  }
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
