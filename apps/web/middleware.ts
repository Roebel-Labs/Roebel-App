import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "dashboard-session";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/**
 * Middleware to protect dashboard routes
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  // Check if user is authenticated
  let isAuthenticated = false;

  if (sessionCookie) {
    try {
      const sessionData = JSON.parse(sessionCookie.value);
      const sessionAge = Date.now() - sessionData.createdAt;

      // Session is valid if not expired
      isAuthenticated = sessionAge <= SESSION_DURATION;
    } catch {
      // Invalid session data
      isAuthenticated = false;
    }
  }

  // Handle dashboard routes (except login page)
  if (pathname.startsWith("/admin/dashboard")) {
    if (!isAuthenticated) {
      // Redirect to login page
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Handle login page
  if (pathname === "/admin/login") {
    if (isAuthenticated) {
      // Already logged in, redirect to dashboard
      const dashboardUrl = new URL("/admin/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Allow request to continue
  return NextResponse.next();
}

/**
 * Configure which routes should be handled by this middleware
 */
export const config = {
  matcher: ["/admin/:path*"],
};
