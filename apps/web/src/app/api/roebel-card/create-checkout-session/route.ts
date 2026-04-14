import { NextRequest, NextResponse } from "next/server";
import {
  stripeCard,
  ROEBEL_CARD_CONFIG,
  computeRoebelCardFee,
  type RoebelCardCheckoutMetadata,
  type FeeMode,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/roebel-card/create-checkout-session
//
// Body (JSON):
//   {
//     amount_cents: number,
//     wallet_address: string,
//     beneficiary_account_id?: string | null,
//     locale?: "de" | "en",
//     fee_mode?: "citizen" | "tourist" | "sachbezug",   // default "tourist"
//     donation_bps?: 1000 | 1500 | 2000 | 2500          // tourist only
//   }
//
// Fee models:
//   citizen  — no fee, card gets full face value
//   tourist  — fee on top (default 10 %, generous tiers 15/20/25 %)
//   sachbezug — fee deducted, org pays ≤50 € total, card gets remainder

const VALID_WALLET = /^0x[a-fA-F0-9]{40}$/;
const VALID_FEE_MODES: FeeMode[] = ["citizen", "tourist", "sachbezug"];

interface RequestBody {
  amount_cents?: unknown;
  wallet_address?: unknown;
  beneficiary_account_id?: unknown;
  locale?: unknown;
  fee_mode?: unknown;
  donation_bps?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Parse fee_mode (default: tourist for backward compat).
  const feeMode: FeeMode =
    typeof body.fee_mode === "string" && VALID_FEE_MODES.includes(body.fee_mode as FeeMode)
      ? (body.fee_mode as FeeMode)
      : "tourist";

  // Parse donation_bps (tourist only).
  let donationBps: number | undefined;
  if (feeMode === "tourist" && body.donation_bps != null) {
    const bps = Number(body.donation_bps);
    const allowed = ROEBEL_CARD_CONFIG.ALLOWED_DONATION_BPS as readonly number[];
    if (!allowed.includes(bps)) {
      return NextResponse.json({ error: "invalid_donation_bps" }, { status: 400 });
    }
    donationBps = bps;
  }

  const amountCents = Number(body.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  }

  // Sachbezug: only allow predefined amounts (10/25/50 €).
  if (feeMode === "sachbezug") {
    const allowed = ROEBEL_CARD_CONFIG.SACHBEZUG_ALLOWED_CENTS as readonly number[];
    if (!allowed.includes(amountCents)) {
      return NextResponse.json({ error: "sachbezug_invalid_amount" }, { status: 400 });
    }
  } else {
    if (amountCents < ROEBEL_CARD_CONFIG.MIN_AMOUNT_CENTS) {
      return NextResponse.json({ error: "amount_too_small" }, { status: 400 });
    }
    if (amountCents > ROEBEL_CARD_CONFIG.MAX_AMOUNT_CENTS) {
      return NextResponse.json({ error: "amount_too_large" }, { status: 400 });
    }
  }

  const walletRaw = typeof body.wallet_address === "string" ? body.wallet_address : "";
  if (!VALID_WALLET.test(walletRaw)) {
    return NextResponse.json({ error: "wallet_required" }, { status: 400 });
  }
  const walletAddress = walletRaw.toLowerCase();

  const beneficiaryInput =
    typeof body.beneficiary_account_id === "string" && body.beneficiary_account_id.length > 0
      ? body.beneficiary_account_id
      : null;

  const locale = body.locale === "en" ? "en" : "de";

  const { cardCreditCents, feeCents, vereineCents, totalCents } =
    computeRoebelCardFee(amountCents, feeMode, donationBps);

  const supabase = createAdminClient();

  // Validate the beneficiary if one was provided. Silently falls back to
  // Röbeler Topf if the target doesn't exist or isn't a Verein. We no
  // longer require is_verified = true (mirrors fetchVerifiedVereine in
  // the Expo app).
  let beneficiaryAccountId: string | null = null;
  if (beneficiaryInput) {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, account_type, sub_type")
      .eq("id", beneficiaryInput)
      .maybeSingle();

    if (accountError) {
      console.error("[roebel-card.create-checkout] beneficiary lookup failed", accountError);
      return NextResponse.json({ error: "beneficiary_lookup_failed" }, { status: 500 });
    }
    if (
      account &&
      account.account_type === "organisation" &&
      account.sub_type === "verein"
    ) {
      beneficiaryAccountId = account.id as string;
    }
  }

  // Look up an existing card for this wallet. If none exists, provision
  // one NOW so the NOT NULL constraint on roebel_card_purchases.card_id
  // is always satisfied. Previous revision passed card_id: null here
  // expecting the webhook to fill it in, but that fails the constraint
  // before the webhook ever runs.
  let cardId: string;
  const { data: existingCard, error: cardLookupError } = await supabase
    .from("roebel_card")
    .select("id")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (cardLookupError) {
    console.error("[roebel-card.create-checkout] card lookup failed", cardLookupError);
    return NextResponse.json(
      { error: "card_lookup_failed", details: cardLookupError.message ?? null },
      { status: 500 },
    );
  }

  if (existingCard) {
    cardId = existingCard.id as string;
  } else {
    // First-time buyer — provision a zero-balance card so the checkout
    // and webhook both have a stable card_id to reference.
    const { data: newCard, error: newCardError } = await supabase
      .from("roebel_card")
      .insert({ wallet_address: walletAddress })
      .select("id")
      .single();
    if (newCardError || !newCard) {
      console.error("[roebel-card.create-checkout] card provision failed", newCardError);
      return NextResponse.json(
        { error: "card_provision_failed", details: newCardError?.message ?? null },
        { status: 500 },
      );
    }
    cardId = newCard.id as string;
  }

  // Insert a pending purchase row. amount_cents = what the card gets
  // (for sachbezug this is less than what Stripe charges). The webhook
  // credits metadata.amount_cents to the card balance.
  const { data: purchaseRow, error: purchaseError } = await supabase
    .from("roebel_card_purchases")
    .insert({
      card_id: cardId,
      amount_cents: cardCreditCents,
      fee_cents: feeCents,
      beneficiary_account_id: beneficiaryAccountId,
      purchaser_wallet_address: walletAddress,
      is_sachbezug: feeMode === "sachbezug",
      status: "pending",
    })
    .select("id")
    .single();

  if (purchaseError || !purchaseRow) {
    console.error("[roebel-card.create-checkout] purchase insert failed", purchaseError);
    return NextResponse.json(
      { error: "purchase_insert_failed", details: purchaseError?.message ?? null },
      { status: 500 },
    );
  }

  const purchaseId = purchaseRow.id as string;

  // Stripe requires https:// success/cancel URLs — custom schemes like
  // roebel:// are rejected. We land on our web success page which then
  // auto-fires the roebel:// deeplink back into the app.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://roebel.app";
  const returnTo = encodeURIComponent("roebel://roebel-card/topup-success");
  const successUrl = `${baseUrl}/roebel-card/success?session_id={CHECKOUT_SESSION_ID}&return_to=${returnTo}`;
  const cancelUrl = `${baseUrl}/roebel-card/success?cancelled=true&return_to=${encodeURIComponent("roebel://roebel-card")}`;

  const cardEuros = (cardCreditCents / 100).toLocaleString(
    locale === "en" ? "en-US" : "de-DE",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  const feeLabel =
    feeMode === "citizen"
      ? ""
      : feeMode === "sachbezug"
        ? ` (davon ${(feeCents / 100).toFixed(2).replace(".", ",")} € für Vereine)`
        : ` (inkl. ${(feeCents / 100).toFixed(2).replace(".", ",")} € Förderanteil)`;

  const metadata: Record<string, string> = {
    kind: "roebel_card",
    wallet_address: walletAddress,
    amount_cents: String(cardCreditCents),
    fee_cents: String(feeCents),
    vereine_cents: String(vereineCents),
    beneficiary_account_id: beneficiaryAccountId ?? "",
    purchase_id: purchaseId,
    fee_mode: feeMode,
  } satisfies Partial<RoebelCardCheckoutMetadata> & Record<string, string>;

  try {
    const session = await stripeCard.checkout.sessions.create({
      mode: "payment",
      locale: locale === "en" ? "en" : "de",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: ROEBEL_CARD_CONFIG.currency,
            unit_amount: totalCents,
            product_data: {
              name: `Röbel Card — ${cardEuros} €`,
              description: `Lokaler Gutschein für Röbel/Müritz${feeLabel}`,
            },
          },
        },
      ],
      metadata,
      client_reference_id: walletAddress,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error("stripe returned session without url");
    }

    // Back-fill the Stripe session id onto the pending purchase row so
    // the admin dashboard can link straight to Stripe even before the
    // webhook fires. Non-fatal — the webhook will also set this field
    // via its `metadata.purchase_id` lookup if this update fails.
    const { error: backfillError } = await supabase
      .from("roebel_card_purchases")
      .update({ stripe_session_id: session.id })
      .eq("id", purchaseId);
    if (backfillError) {
      console.warn(
        "[roebel-card.create-checkout] stripe_session_id back-fill failed",
        backfillError,
      );
    }

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
      purchase_id: purchaseId,
      card_credit_cents: cardCreditCents,
      fee_cents: feeCents,
      total_cents: totalCents,
    });
  } catch (error) {
    console.error("[roebel-card.create-checkout] stripe error", error);
    // Roll back the pending purchase row so we don't leak stale pendings
    // every time Stripe fails.
    await supabase.from("roebel_card_purchases").delete().eq("id", purchaseId);
    return NextResponse.json(
      { error: "stripe_error", details: (error as Error).message ?? "" },
      { status: 500 },
    );
  }
}
