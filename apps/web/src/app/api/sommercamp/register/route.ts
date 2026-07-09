// Sommer Camp hackathon registration (landing page /sommercamp).
// Wallet-based: the connected thirdweb account registers with name/age +
// consents. Registering also creates the `developers` row, so participants
// land in the mini-app builder dashboard ready to build.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, resolveDeveloper } from "@/lib/miniapp/http";
import { subscribeToNewsletter } from "@/app/actions/newsletter-public";
import { sendSommercampConfirmation } from "@/lib/email/sommercamp-confirmation";

export const runtime = "nodejs";

const EVENT = "sommercamp-2026";
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Best-effort per-IP throttle (warm-lambda scope), same pattern as the public
// newsletter signup. The unique(event,wallet) constraint is the hard stop.
const ipHits = new Map<string, { count: number; resetAt: number }>();
function ipThrottled(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

type RegisterBody = {
  wallet?: string;
  name?: string;
  age?: number;
  privacy?: boolean;
  agb?: boolean;
  newsletterOptIn?: boolean;
  email?: string;
  // Login-E-Mail des thirdweb-Kontos (vom Client aus den linked profiles
  // gelesen) — Empfänger der Anmelde-Bestätigung.
  authEmail?: string;
};

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (ipThrottled(ip)) {
      return NextResponse.json(
        { error: "Zu viele Anfragen — bitte versuche es später erneut." },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as RegisterBody | null;
    if (!body) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    const name = (body.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { error: "Bitte gib deinen Namen an (2–80 Zeichen)." },
        { status: 400 },
      );
    }
    const age = Number(body.age);
    if (!Number.isInteger(age) || age < 6 || age > 99) {
      return NextResponse.json(
        { error: "Bitte gib dein Alter an (6–99)." },
        { status: 400 },
      );
    }
    if (body.privacy !== true || body.agb !== true) {
      return NextResponse.json(
        { error: "Bitte akzeptiere Datenschutz und AGB." },
        { status: 400 },
      );
    }
    const newsletterOptIn = body.newsletterOptIn === true;
    const email = (body.email ?? "").trim().toLowerCase();
    if (newsletterOptIn && !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Bitte gib eine gültige E-Mail-Adresse für den Newsletter an." },
        { status: 400 },
      );
    }

    // Resolves the wallet (header/body) and creates the developers row —
    // registration doubles as builder onboarding.
    const developer = await resolveDeveloper(req, body);
    if (!developer.display_name) {
      await createAdminClient()
        .from("developers")
        .update({ display_name: name })
        .eq("id", developer.id);
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("hackathon_registrations")
      .select("id")
      .eq("event", EVENT)
      .eq("wallet", developer.wallet)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("hackathon_registrations")
        .update({ name, age, newsletter_opt_in: newsletterOptIn })
        .eq("id", existing.id);
    } else {
      const { error: insErr } = await supabase
        .from("hackathon_registrations")
        .insert({
          event: EVENT,
          wallet: developer.wallet,
          name,
          age,
          privacy_accepted_at: now,
          agb_accepted_at: now,
          newsletter_opt_in: newsletterOptIn,
        });
      if (insErr && insErr.code !== "23505") {
        console.error("[sommercamp/register] insert failed:", insErr);
        return NextResponse.json(
          { error: "Etwas ist schiefgelaufen. Bitte versuche es später erneut." },
          { status: 500 },
        );
      }
    }

    // Non-fatal: the double-opt-in flow handles throttling/dedupe itself.
    if (newsletterOptIn) {
      try {
        await subscribeToNewsletter(email);
      } catch (e) {
        console.error("[sommercamp/register] newsletter opt-in failed:", e);
      }
    }

    // Bestätigungs-Mail ("du bist dabei") — nur bei Erst-Anmeldung, an die
    // thirdweb-Login-E-Mail, sonst an die Newsletter-E-Mail. Non-fatal.
    let confirmationSent = false;
    if (!existing) {
      const authEmail = (body.authEmail ?? "").trim().toLowerCase();
      const confirmTo = EMAIL_RE.test(authEmail)
        ? authEmail
        : newsletterOptIn && EMAIL_RE.test(email)
          ? email
          : null;
      if (confirmTo) {
        confirmationSent = await sendSommercampConfirmation({
          email: confirmTo,
          name,
        });
      }
    }

    return NextResponse.json({ ok: true, already: !!existing, confirmationSent });
  } catch (e) {
    return jsonError(e);
  }
}

// Lets the landing page show "Du bist angemeldet" for a connected wallet.
export async function GET(req: Request) {
  try {
    const wallet = (new URL(req.url).searchParams.get("wallet") ?? "")
      .trim()
      .toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
      return NextResponse.json({ registered: false });
    }
    const { data } = await createAdminClient()
      .from("hackathon_registrations")
      .select("id")
      .eq("event", EVENT)
      .eq("wallet", wallet)
      .maybeSingle();
    return NextResponse.json({ registered: !!data });
  } catch (e) {
    return jsonError(e);
  }
}
