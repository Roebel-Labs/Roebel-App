import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("⚠️ RESEND_API_KEY is not set - emails will not be sent");
}

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Email configuration
export const EMAIL_CONFIG = {
  from: "Röbel App <tickets@roebel.app>", // Update with your verified domain
  replyTo: "support@roebel.app",
} as const;
