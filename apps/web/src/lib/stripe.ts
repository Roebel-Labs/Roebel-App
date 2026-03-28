import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Event ticket configuration
export const TICKET_CONFIG = {
  event_name: "MV Boxen Landesmeisterschaft 2026",
  event_location: "Turnhalle am Gotthunskamp, Röbel/Müritz",
  price_cents: 299, // €2.99
  currency: "eur",
  days: {
    saturday: { date: "7. März 2026", label: "Samstag" },
    sunday: { date: "8. März 2026", label: "Sonntag" },
  },
} as const;

export type EventDay = keyof typeof TICKET_CONFIG.days;

// Generate a unique ticket code
export function generateTicketCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 0/O, 1/I
  let code = "BOXEN-2026-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
