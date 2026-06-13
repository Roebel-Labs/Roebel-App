"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";

// Credentials are read from environment variables (never hardcoded — this
// repo is public). Set ADMIN_USERNAME and ADMIN_PASSWORD in the deployment env.
const VALID_USERNAME = process.env.ADMIN_USERNAME;
const VALID_PASSWORD = process.env.ADMIN_PASSWORD;

interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * Handle dashboard login with static credentials
 */
export async function loginAction(
  _prevState: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  // Validate inputs
  if (!username || !password) {
    return {
      success: false,
      error: "Bitte geben Sie Benutzername und Passwort ein.",
    };
  }

  // Guard against misconfiguration: if credentials aren't set in the
  // environment, deny all logins rather than allowing an empty match.
  if (!VALID_USERNAME || !VALID_PASSWORD) {
    console.error(
      "ADMIN_USERNAME / ADMIN_PASSWORD are not configured — login disabled."
    );
    return {
      success: false,
      error: "Anmeldung ist derzeit nicht konfiguriert.",
    };
  }

  // Check credentials
  if (username !== VALID_USERNAME || password !== VALID_PASSWORD) {
    return {
      success: false,
      error: "Ungültige Anmeldedaten.",
    };
  }

  // Create session
  await createSession(username);

  // Redirect to dashboard
  redirect("/admin/dashboard");
}

/**
 * Handle dashboard logout
 */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
