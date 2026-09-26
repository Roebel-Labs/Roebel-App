import { NextResponse } from "next/server";
import { passkeyEmailEnabled, passkeyEmailStore, passkeyMailer } from "@/lib/passkey/email-runtime";
import { createGnosisRecoveryLogReader, runRecoveryAlerts } from "@/lib/passkey/recovery-alerts";

/**
 * PREVIEW-ONLY recovery alert sender (Vercel-cron style, CRON_SECRET bearer like the other crons).
 * Scans the Candide SocialRecoveryModule for RecoveryExecuted since the stored cursor and emails
 * each recovered wallet's verified warning address. Idempotent per (wallet, recovery nonce).
 *
 * NOT in vercel.json yet (gate). Needs PASSKEY_EMAIL_ENABLED=1 and PASSKEY_EMAIL_STORE=supabase
 * (the cursor and the sent-alert claims must survive between runs; the in-memory store is refused).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!passkeyEmailEnabled()) return NextResponse.json({ error: "disabled" }, { status: 503 });
  if (process.env.PASSKEY_EMAIL_STORE !== "supabase") {
    return NextResponse.json({ error: "store_not_persistent" }, { status: 503 });
  }
  try {
    const result = await runRecoveryAlerts({
      reader: createGnosisRecoveryLogReader(),
      store: passkeyEmailStore(),
      mailer: passkeyMailer(),
      nowSec: () => Math.floor(Date.now() / 1000),
    });
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 502 });
  } catch (e) {
    console.error("[passkey-recovery-alerts] run failed:", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "run_failed" }, { status: 503 });
  }
}
