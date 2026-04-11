import { NextRequest, NextResponse } from "next/server";
import {
  stripeCard,
  ROEBEL_CARD_CONFIG,
  computeRoebelCardFee,
  type RoebelCardCheckoutMetadata,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/roebel-card/create-checkout-session
//
// Body (JSON):
//   {
//     amount_cents: number,          // face value the card will be credited
//     wallet_address: string,        // 0x... hex, lowercased server-side
//     beneficiary_account_id?: string | null,
//                                    // UUID of a verified Verein account,
//                                    // or null/omitted for Röbeler Topf
//     locale?: "de" | "en"
//   }
//
// Flow:
//   1. Validate inputs against ROEBEL_CARD_CONFIG min/max.
//   2. Compute fee + Verein split server-side via computeRoebelCardFee.
//   3. If a beneficiary was provided, verify the account is an organisation
//      with sub_type='verein' and is_verified=true. Falls back to Topf
//      (null) if not — mirrors the webhook's safety net.
//   4. Insert a roebel_card_purchases row with status='pending' so the
//      webhook has a pre-created row to look up by metadata.purchase_id.
//      The card_id is set if the buyer already has a card, otherwise
//      left NULL and filled in by the webhook after provisioning.
//   5. Create a Stripe Checkout Session with price_data (no pre-configured
//      Product), line item "Röbel Card X €" at the total (face + fee), and
//      metadata matching RoebelCardCheckoutMetadata.
//   6. Return the session URL and id.
//
// No auth check: anyone who can pay Stripe may credit any wallet. This
// matches real-world Sachbezug (employers legitimately pay for employees).
// The only abuse surface is spamming pending rows, mitigated by basic
// rate limiting in front of this endpoint (add later if needed).

const VALID_WALLET = /^0x[a-fA-F0-9]{40}$/;

interface RequestBody {
  amount_cents?: unknown;
  wallet_address?: unknown;
  beneficiary_account_id?: unknown;
  locale?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const amountCents = Number(body.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  }
  if (amountCents < ROEBEL_CARD_CONFIG.MIN_AMOUNT_CENTS) {
    return NextResponse.json(
      { error: "amount_too_small" },
      { status: 400 },
    );
  }
  if (amountCents > ROEBEL_CARD_CONFIG.MAX_AMOUNT_CENTS) {
    return NextResponse.json(
      { error: "amount_too_large" },
      { status: 400 },
    );
  }

  const walletRaw = typeof body.wallet_address === "string" ? body.wallet_address : "";
  if (!VALID_WALLET.test(walletRaw)) {
    return NextResponse.json(
      { error: "wallet_required" },
      { status: 400 },
    );
  }
  const walletAddress = walletRaw.toLowerCase();

  const beneficiaryInput =
    typeof body.beneficiary_account_id === "string" && body.beneficiary_account_id.length > 0
      ? body.beneficiary_account_id
      : null;

  const locale = body.locale === "en" ? "en" : "de";

  const { feeCents, vereineCents, totalCents } = computeRoebelCardFee(amountCents);

  const supabase = createAdminClient();

  // Validate the beneficiary if one was provided. Silently falls back to
  // Röbeler Topf if the target doesn't exist or isn't a verified Verein.
  let beneficiaryAccountId: string | null = null;
  if (beneficiaryInput) {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, account_type, sub_type, is_verified")
      .eq("id", beneficiaryInput)
      .maybeSingle();

    if (accountError) {
      console.error("[roebel-card.create-checkout] beneficiary lookup failed", accountError);
      return NextResponse.json({ error: "beneficiary_lookup_failed" }, { status: 500 });
    }
    if (
      account &&
      account.account_type === "organisation" &&
      account.sub_type === "verein" &&
      account.is_verified
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

  // Insert a pending purchase row. The webhook will look it up by
  // metadata.purchase_id and flip status to 'paid'.
  const { data: purchaseRow, error: purchaseError } = await supabase
    .from("roebel_card_purchases")
    .insert({
      card_id: cardId,
      amount_cents: amountCents,
      fee_cents: feeCents,
      beneficiary_account_id: beneficiaryAccountId,
      purchaser_wallet_address: walletAddress,
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

  // Compose the success / cancel deep links back into the Expo app.
  // Stripe appends its own query params to success_url, but roebel://
  // scheme handlers ignore unknown params so it's safe.
  const successUrl = "roebel://roebel-card/topup-success?session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = "roebel://roebel-card";

  const faceEuros = (amountCents / 100).toLocaleString(
    locale === "en" ? "en-US" : "de-DE",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  const metadata: Record<string, string> = {
    // Shape matches RoebelCardCheckoutMetadata in apps/web/src/lib/stripe.ts
    // so the webhook can parse it via parseRoebelCardMetadata.
    kind: "roebel_card",
    wallet_address: walletAddress,
    amount_cents: String(amountCents),
    fee_cents: String(feeCents),
    vereine_cents: String(vereineCents),
    beneficiary_account_id: beneficiaryAccountId ?? "",
    purchase_id: purchaseId,
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
              name: `Röbel Card — ${faceEuros} €`,
              description:
                "Lokaler Gutschein für teilnehmende Partner in Röbel/Müritz. 10 % unterstützen lokale Vereine und den Handel.",
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

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
      purchase_id: purchaseId,
      amount_cents: amountCents,
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
