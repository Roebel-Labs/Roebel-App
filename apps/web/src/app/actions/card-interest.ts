"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCitizenInterestConfirmation } from "@/lib/email/card-interest-confirmation";
import { sendMerchantInterestConfirmation } from "@/lib/email/merchant-interest-confirmation";

export type InterestActionResult =
  | { ok: true; alreadyRegistered: false }
  | { ok: true; alreadyRegistered: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const citizenSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein."),
  plz: z
    .string()
    .regex(/^\d{5}$/, "Bitte geben Sie eine 5-stellige Postleitzahl ein."),
  firstName: z.string().trim().max(80).optional().or(z.literal("")),
});

const merchantSchema = z.object({
  contactName: z.string().trim().min(2, "Bitte geben Sie Ihren Namen ein.").max(120),
  businessName: z.string().trim().min(2, "Bitte geben Sie den Geschäftsnamen ein.").max(160),
  address: z.string().trim().min(4, "Bitte geben Sie die Adresse ein.").max(240),
  phone: z.string().trim().min(5, "Bitte geben Sie eine Telefonnummer ein.").max(40),
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein."),
  branche: z.string().trim().min(2, "Bitte wählen Sie eine Branche.").max(80),
});

function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function submitCitizenInterest(input: {
  email: string;
  plz: string;
  firstName?: string;
}): Promise<InterestActionResult> {
  const parsed = citizenSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte überprüfen Sie Ihre Eingaben.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { email, plz, firstName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedFirstName = firstName?.trim() || null;

  const supabase = createAdminClient();
  const { error } = await supabase.from("card_interest").insert({
    email: normalizedEmail,
    plz,
    first_name: trimmedFirstName,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyRegistered: true };
    }
    console.error("[card-interest] insert failed", error);
    return { ok: false, error: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut." };
  }

  // Fire-and-forget email; do not block the user response on Resend.
  void sendCitizenInterestConfirmation({
    email: normalizedEmail,
    firstName: trimmedFirstName,
    plz,
  });

  return { ok: true, alreadyRegistered: false };
}

export async function submitMerchantInterest(input: {
  contactName: string;
  businessName: string;
  address: string;
  phone: string;
  email: string;
  branche: string;
}): Promise<InterestActionResult> {
  const parsed = merchantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte überprüfen Sie Ihre Eingaben.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const normalizedEmail = data.email.trim().toLowerCase();

  const supabase = createAdminClient();
  const { error } = await supabase.from("merchant_interest").insert({
    contact_name: data.contactName,
    business_name: data.businessName,
    address: data.address,
    phone: data.phone,
    email: normalizedEmail,
    branche: data.branche,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyRegistered: true };
    }
    console.error("[merchant-interest] insert failed", error);
    return { ok: false, error: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut." };
  }

  void sendMerchantInterestConfirmation({
    email: normalizedEmail,
    contactName: data.contactName,
    businessName: data.businessName,
    branche: data.branche,
  });

  return { ok: true, alreadyRegistered: false };
}

export interface InterestCounts {
  citizens: number;
  merchants: number;
}

export async function getInterestCounts(): Promise<InterestCounts> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_card_interest_counts");

  if (error || !data) {
    if (error) console.error("[card-interest] count rpc failed", error);
    return { citizens: 0, merchants: 0 };
  }

  // The RPC returns a single-row table-valued result.
  const row = Array.isArray(data) ? data[0] : (data as { citizens: number; merchants: number });
  if (!row) return { citizens: 0, merchants: 0 };

  return {
    citizens: Number(row.citizens ?? 0),
    merchants: Number(row.merchants ?? 0),
  };
}
