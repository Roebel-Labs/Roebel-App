"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateSlug } from "@/lib/slug";
import type { OrgSubType } from "@/types/account";
import { resend, EMAIL_CONFIG } from "@/lib/resend";

const ALLOWED_SUB_TYPES: OrgSubType[] = [
  "journalist",
  "unternehmen",
  "verein",
  "partei",
  "fraktion",
  "restaurant",
];

export interface ExternSignupResult {
  success: boolean;
  accountId?: string;
  error?: string;
}

async function uniqueAccountSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string
): Promise<string> {
  const baseSlug = base || "extern";
  let slug = baseSlug;
  let n = 1;
  while (true) {
    const { data } = await supabase
      .from("accounts")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (!data || data.length === 0) return slug;
    n += 1;
    slug = `${baseSlug}-${n}`;
  }
}

/**
 * Self-serve extern org signup.
 * Creates a pending account and a placeholder user keyed by the email.
 * No wallet is required at this stage — admin approval unlocks publishing.
 */
export async function submitExternSignup(formData: FormData): Promise<ExternSignupResult> {
  try {
    const supabase = await createClient();

    const email = (formData.get("email") as string)?.trim().toLowerCase();
    const name = (formData.get("name") as string)?.trim();
    const subType = formData.get("sub_type") as OrgSubType;
    const reason = ((formData.get("reason") as string) ?? "").trim();

    if (!email || !name || !subType) {
      return { success: false, error: "Pflichtfelder fehlen" };
    }
    if (!email.includes("@")) {
      return { success: false, error: "E-Mail ist ungültig" };
    }
    if (!ALLOWED_SUB_TYPES.includes(subType)) {
      return { success: false, error: "Ungültiger Organisationstyp" };
    }

    // Reject duplicate pending applications for same email + name
    const { data: existing } = await supabase
      .from("accounts")
      .select("id, extern_status")
      .eq("contact_email", email)
      .eq("name", name)
      .maybeSingle();
    if (existing) {
      return {
        success: false,
        error: `Es existiert bereits ein Antrag für diesen Namen (Status: ${existing.extern_status ?? "—"})`,
      };
    }

    // Ensure a placeholder user row exists. We use the email as the wallet
    // placeholder (`extern:<email>`) so account_owners FK is satisfied.
    const placeholderWallet = `extern:${email}`;

    const { data: existingUser } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("wallet_address", placeholderWallet)
      .maybeSingle();

    if (!existingUser) {
      const { error: userErr } = await supabase.from("users").insert({
        wallet_address: placeholderWallet,
        email,
        is_extern: true,
      });
      if (userErr) {
        console.error("submitExternSignup user insert error:", userErr);
        return { success: false, error: "Konto konnte nicht angelegt werden" };
      }
    } else {
      await supabase
        .from("users")
        .update({ email, is_extern: true })
        .eq("wallet_address", placeholderWallet);
    }

    const slug = await uniqueAccountSlug(supabase, generateSlug(name));

    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .insert({
        account_type: "organisation",
        sub_type: subType,
        name,
        slug,
        is_extern: true,
        extern_status: "pending",
        extern_reason: reason || null,
        contact_email: email,
      })
      .select("id")
      .single();

    if (accErr || !account) {
      console.error("submitExternSignup account insert error:", accErr);
      return { success: false, error: "Konto konnte nicht angelegt werden" };
    }

    const { error: ownerErr } = await supabase
      .from("account_owners")
      .insert({
        account_id: account.id,
        wallet_address: placeholderWallet,
        role: "owner",
      });
    if (ownerErr) {
      console.error("submitExternSignup owner insert error:", ownerErr);
    }

    if (resend) {
      try {
        await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: email,
          subject: "Antrag erhalten — Röbel App",
          text: `Hallo,\n\ndein Antrag für ein externes Organisationskonto („${name}") wurde empfangen und wird vom Röbel-Team geprüft. Du erhältst eine weitere E-Mail, sobald dein Konto freigegeben ist.\n\nViele Grüße\nRöbel App`,
        });
      } catch (e) {
        console.error("submitExternSignup email error:", e);
      }
    }

    revalidatePath("/admin/dashboard/extern-accounts");

    return { success: true, accountId: account.id };
  } catch (error) {
    console.error("submitExternSignup error:", error);
    return { success: false, error: "Unerwarteter Fehler" };
  }
}

export async function getExternStatus(
  email: string
): Promise<{ status: string | null; name: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("extern_status, name")
    .eq("contact_email", email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { status: data.extern_status, name: data.name };
}

export async function approveExtern(
  accountId: string,
  reviewerWallet: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("contact_email, name")
    .eq("id", accountId)
    .maybeSingle();

  const { error } = await supabase
    .from("accounts")
    .update({
      extern_status: "approved",
      extern_reviewed_by: reviewerWallet,
      extern_reviewed_at: new Date().toISOString(),
      is_verified: true,
    })
    .eq("id", accountId);

  if (error) {
    console.error("approveExtern error:", error);
    return { success: false, error: "Fehler beim Freigeben" };
  }

  if (resend && account?.contact_email) {
    try {
      await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: account.contact_email,
        subject: "Konto freigegeben — Röbel App",
        text: `Hallo,\n\ndein externes Organisationskonto („${account.name}") wurde freigegeben. Du kannst jetzt Artikel veröffentlichen und das Dashboard nutzen.\n\nViele Grüße\nRöbel App`,
      });
    } catch (e) {
      console.error("approveExtern email error:", e);
    }
  }

  revalidatePath("/admin/dashboard/extern-accounts");
  revalidatePath("/extern/pending");
  return { success: true };
}

export async function rejectExtern(
  accountId: string,
  reviewerWallet: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("contact_email, name")
    .eq("id", accountId)
    .maybeSingle();

  const { error } = await supabase
    .from("accounts")
    .update({
      extern_status: "rejected",
      extern_reviewed_by: reviewerWallet,
      extern_reviewed_at: new Date().toISOString(),
      extern_reason: reason ?? null,
    })
    .eq("id", accountId);

  if (error) {
    console.error("rejectExtern error:", error);
    return { success: false, error: "Fehler beim Ablehnen" };
  }

  if (resend && account?.contact_email) {
    try {
      await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: account.contact_email,
        subject: "Antrag abgelehnt — Röbel App",
        text: `Hallo,\n\ndein Antrag für ein externes Organisationskonto („${account.name}") wurde leider abgelehnt.${reason ? `\n\nGrund: ${reason}` : ""}\n\nViele Grüße\nRöbel App`,
      });
    } catch (e) {
      console.error("rejectExtern email error:", e);
    }
  }

  revalidatePath("/admin/dashboard/extern-accounts");
  return { success: true };
}

export async function listPendingExternAccounts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select(
      "id, name, sub_type, contact_email, extern_reason, extern_status, created_at"
    )
    .eq("is_extern", true)
    .order("created_at", { ascending: false });
  return data || [];
}
