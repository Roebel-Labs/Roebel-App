"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";

// Static credentials
const VALID_USERNAME = "kulturausschuss";
const VALID_PASSWORD = "Roebel2025!Kultur";

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
