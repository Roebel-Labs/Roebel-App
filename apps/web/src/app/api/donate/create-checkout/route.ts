import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DONATION_CONFIG,
  type TreasuryDonationMetadata,
} from "@/lib/donations/config";
import { getDonationSettings } from "@/lib/donations/monerium";

export const dynamic = "force-dynamic";

// POST /api/donate/create-checkout
//
// Body (JSON):
//   {
//     amount_cents: number,             // 100 .. 500000
//     donor_name?: string,              // public display name (optional)
//     donor_message?: string,           // optional public message
//     wallet_address?: string,          // app-user attribution (optional)
//     public_visible?: boolean,         // default true
//     locale?: "de" | "en"
//   }
//
// Creates a pending `donations` row (rail 'stripe') and a Stripe Checkout
// Session. Funds reach the treasury via the account's payout to the
// Monerium IBAN (auto-mints EURe into the Safe).
//
// Wording: "Unterstützungsbeitrag", NOT "Spende" — see
// docs/MONERIUM_FIAT_TREASURY_RESEARCH.md §5 (Stripe ToS) and §6.

const VALID_WALLET = /^0x[a-fA-F0-9]{40}$/;

interface RequestBody {
  amount_cents?: unknown;
  donor_name?: unknown;
  donor_message?: unknown;
  wallet_address?: unknown;
  public_visible?: unknown;
  locale?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const settings = await getDonationSettings();
  if (!settings.enabled) {
    return NextResponse.json({ error: "donations_disabled" }, { status: 403 });
  }

  const amountCents = Number(body.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  }
  if (amountCents < DONATION_CONFIG.MIN_AMOUNT_CENTS) {
    return NextResponse.json({ error: "amount_too_small" }, { status: 400 });
  }
  if (amountCents > DONATION_CONFIG.MAX_AMOUNT_CENTS) {
    return NextResponse.json({ error: "amount_too_large" }, { status: 400 });
  }

  const donorName =
    typeof body.donor_name === "string"
      ? body.donor_name.trim().slice(0, DONATION_CONFIG.MAX_DONOR_NAME_LEN)
      : "";
  const donorMessage =
    typeof body.donor_message === "string"
      ? body.donor_message.trim().slice(0, DONATION_CONFIG.MAX_DONOR_MESSAGE_LEN)
      : "";
  const walletAddress =
    typeof body.wallet_address === "string" && VALID_WALLET.test(body.wallet_address)
      ? body.wallet_address.toLowerCase()
      : null;
  const publicVisible = body.public_visible !== false;
  const locale = body.locale === "en" ? "en" : "de";

  const supabase = createAdminClient();

  const { data: donationRow, error: insertErr } = await supabase
    .from("donations")
    .insert({
      rail: "stripe",
      status: "pending",
      amount_cents: amountCents,
      currency: "eur",
      donor_name: donorName || null,
      donor_message: donorMessage || null,
      donor_wallet_address: walletAddress,
      public_visible: publicVisible,
    })
    .select("id")
    .single();

  if (insertErr || !donationRow) {
    console.error("[donate.create-checkout] donation insert failed", insertErr);
    return NextResponse.json(
      { error: "donation_insert_failed", details: insertErr?.message ?? null },
      { status: 500 },
    );
  }
  const donationId = donationRow.id as string;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://roebel.app";
  const returnTo = encodeURIComponent("roebel://donate/success");
  const successUrl = `${baseUrl}/spenden/danke?session_id={CHECKOUT_SESSION_ID}&return_to=${returnTo}`;
  const cancelUrl = `${baseUrl}/spenden?cancelled=true`;

  const metadata: Record<string, string> = {
    kind: "treasury_donation",
    donation_id: donationId,
    amount_cents: String(amountCents),
    donor_name: donorName,
    donor_wallet_address: walletAddress ?? "",
    public_visible: String(publicVisible),
  } satisfies TreasuryDonationMetadata & Record<string, string>;

  const euros = (amountCents / 100).toLocaleString(
    locale === "en" ? "en-US" : "de-DE",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: DONATION_CONFIG.currency,
            unit_amount: amountCents,
            product_data: {
              name:
                locale === "en"
                  ? `Community contribution — ${euros} €`
                  : `Unterstützungsbeitrag — ${euros} €`,
              description:
                locale === "en"
                  ? "Voluntary contribution to the transparent community treasury of Röbel/Müritz"
                  : "Freiwilliger Beitrag zur transparenten Gemeinschaftskasse Röbel/Müritz",
            },
          },
        },
      ],
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error("stripe returned session without url");
    }

    // Back-fill the session id so the ledger links to Stripe even before the
    // webhook fires; the webhook also sets it via metadata.donation_id.
    const { error: backfillErr } = await supabase
      .from("donations")
      .update({ stripe_session_id: session.id })
      .eq("id", donationId);
    if (backfillErr) {
      console.warn("[donate.create-checkout] session back-fill failed", backfillErr);
    }

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
      donation_id: donationId,
      amount_cents: amountCents,
    });
  } catch (error) {
    console.error("[donate.create-checkout] stripe error", error);
    // Roll back the pending row so we don't leak stale pendings.
    await supabase.from("donations").delete().eq("id", donationId);
    return NextResponse.json(
      { error: "stripe_error", details: (error as Error).message ?? "" },
      { status: 500 },
    );
  }
}
