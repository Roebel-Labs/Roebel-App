import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  stripe,
  ROEBEL_CARD_CONFIG,
  computeRoebelCardFee,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe webhook for Röbel Card purchases.
//
// The mobile Expo app opens a Stripe Payment Link directly (no call to
// our backend). When the buyer completes payment Stripe fires
// `checkout.session.completed`. We identify Röbel Card purchases via
// `session.client_reference_id` using the format:
//
//   rc1|w:<wallet>|b:<verein_uuid_or_TOPF>
//
// The face value and fee are reverse-computed from `session.amount_total`
// using the configured 10 % fee ratio (see ROEBEL_CARD_CONFIG). This
// keeps the mobile → Stripe handoff simple: no per-session API call.
//
// Idempotency: each Stripe session id is unique, so we upsert the
// roebel_card_purchases row on (stripe_session_id) — duplicate deliveries
// become no-ops.

const CLIENT_REF_PREFIX = "rc1";

interface ParsedClientRef {
  walletAddress: string;
  beneficiaryAccountId: string | null;
}

function parseClientReference(value: string | null): ParsedClientRef | null {
  if (!value) return null;
  const parts = value.split("|");
  if (parts[0] !== CLIENT_REF_PREFIX) return null;

  let walletAddress: string | null = null;
  let beneficiary: string | null = null;

  for (const part of parts.slice(1)) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx);
    const val = part.slice(idx + 1);
    if (key === "w") walletAddress = val;
    else if (key === "b") beneficiary = val;
  }

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return null;
  }

  return {
    walletAddress,
    beneficiaryAccountId:
      !beneficiary || beneficiary === "TOPF" ? null : beneficiary,
  };
}

/**
 * Reverse-compute face value + fee from the total the buyer paid.
 *
 * With FEE_BPS = 1000 (10 %), total = face * 1.10. We invert that:
 *   face = round(total / 1.10)
 *   fee  = total - face
 *
 * Rounding is done with `Math.round` to the nearest cent.
 */
function splitTotal(totalCents: number): {
  faceCents: number;
  feeCents: number;
  vereineCents: number;
} {
  const feeBps = ROEBEL_CARD_CONFIG.FEE_BPS;
  const faceCents = Math.round((totalCents * 10000) / (10000 + feeBps));
  const feeCents = totalCents - faceCents;
  const { vereineCents } = computeRoebelCardFee(faceCents);
  return { faceCents, feeCents, vereineCents };
}

export async function POST(request: NextRequest) {
  console.log("🔔 [RoebelCard.webhook] received");

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("❌ [RoebelCard.webhook] missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret =
    process.env.STRIPE_ROEBEL_CARD_WEBHOOK_SECRET ??
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ [RoebelCard.webhook] webhook secret not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "❌ [RoebelCard.webhook] signature verification failed:",
      message,
    );
    return NextResponse.json(
      { error: "Invalid signature", details: message },
      { status: 400 },
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const parsed = parseClientReference(session.client_reference_id);
  if (!parsed) {
    // Not one of ours (e.g. the event tickets flow) — ignore silently.
    return NextResponse.json({ received: true });
  }

  const totalCents = session.amount_total;
  if (!totalCents || totalCents <= 0) {
    console.error(
      "❌ [RoebelCard.webhook] missing amount_total on session",
      session.id,
    );
    return NextResponse.json({ error: "Missing amount" }, { status: 400 });
  }

  const { faceCents, feeCents, vereineCents } = splitTotal(totalCents);

  const supabase = createAdminClient();

  // Idempotency: short-circuit if we've already recorded this session.
  const { data: existing, error: existingErr } = await supabase
    .from("roebel_card_purchases")
    .select("id, status")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existingErr) {
    console.error(
      "❌ [RoebelCard.webhook] existing purchase lookup failed:",
      existingErr,
    );
    return NextResponse.json(
      { error: "Lookup failed" },
      { status: 500 },
    );
  }

  if (existing && existing.status === "paid") {
    console.log(
      "ℹ️  [RoebelCard.webhook] already processed",
      session.id,
      "— idempotent no-op",
    );
    return NextResponse.json({ received: true });
  }

  // Validate the beneficiary account, if one was referenced.
  let beneficiaryAccountId: string | null = null;
  if (parsed.beneficiaryAccountId) {
    const { data: account, error: accountErr } = await supabase
      .from("accounts")
      .select("id, account_type")
      .eq("id", parsed.beneficiaryAccountId)
      .maybeSingle();
    if (accountErr) {
      console.error(
        "❌ [RoebelCard.webhook] beneficiary lookup failed:",
        accountErr,
      );
    } else if (account && account.account_type === "verein") {
      beneficiaryAccountId = account.id as string;
    } else {
      console.warn(
        "⚠️  [RoebelCard.webhook] beneficiary not a Verein, falling back to Topf",
        parsed.beneficiaryAccountId,
      );
    }
  }

  // Find or create the user's Röbel Card.
  let cardId: string;
  const { data: existingCards, error: cardLookupErr } = await supabase
    .from("roebel_card")
    .select("id, balance_cents")
    .eq("wallet_address", parsed.walletAddress)
    .order("created_at", { ascending: true })
    .limit(1);

  if (cardLookupErr) {
    console.error(
      "❌ [RoebelCard.webhook] card lookup failed:",
      cardLookupErr,
    );
    return NextResponse.json({ error: "Card lookup failed" }, { status: 500 });
  }

  if (existingCards && existingCards.length > 0) {
    cardId = existingCards[0].id as string;
  } else {
    const { data: newCard, error: insertCardErr } = await supabase
      .from("roebel_card")
      .insert({ wallet_address: parsed.walletAddress })
      .select("id")
      .single();
    if (insertCardErr || !newCard) {
      console.error(
        "❌ [RoebelCard.webhook] card insert failed:",
        insertCardErr,
      );
      return NextResponse.json(
        { error: "Card insert failed" },
        { status: 500 },
      );
    }
    cardId = newCard.id as string;
  }

  // Read current balance and add the face value.
  const { data: cardRow, error: cardReadErr } = await supabase
    .from("roebel_card")
    .select("balance_cents")
    .eq("id", cardId)
    .single();

  if (cardReadErr || !cardRow) {
    console.error(
      "❌ [RoebelCard.webhook] card balance read failed:",
      cardReadErr,
    );
    return NextResponse.json(
      { error: "Card balance read failed" },
      { status: 500 },
    );
  }

  const newBalance = Number(cardRow.balance_cents) + faceCents;

  // Insert the purchase row (paid immediately — Stripe already settled).
  let purchaseId: string;
  if (existing) {
    // Re-deliver of a prior event we never marked paid; update existing.
    const { data: updated, error: updateErr } = await supabase
      .from("roebel_card_purchases")
      .update({
        amount_cents: faceCents,
        fee_cents: feeCents,
        beneficiary_account_id: beneficiaryAccountId,
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updateErr || !updated) {
      console.error(
        "❌ [RoebelCard.webhook] purchase update failed:",
        updateErr,
      );
      return NextResponse.json(
        { error: "Purchase update failed" },
        { status: 500 },
      );
    }
    purchaseId = updated.id as string;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("roebel_card_purchases")
      .insert({
        card_id: cardId,
        amount_cents: faceCents,
        fee_cents: feeCents,
        beneficiary_account_id: beneficiaryAccountId,
        purchaser_wallet_address: parsed.walletAddress,
        stripe_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.error(
        "❌ [RoebelCard.webhook] purchase insert failed:",
        insertErr,
      );
      return NextResponse.json(
        { error: "Purchase insert failed" },
        { status: 500 },
      );
    }
    purchaseId = inserted.id as string;
  }

  // Credit the card balance.
  const { error: balanceErr } = await supabase
    .from("roebel_card")
    .update({ balance_cents: newBalance })
    .eq("id", cardId);

  if (balanceErr) {
    console.error(
      "❌ [RoebelCard.webhook] balance update failed:",
      balanceErr,
    );
    return NextResponse.json(
      { error: "Balance update failed" },
      { status: 500 },
    );
  }

  // Allocate the Vereine share.
  if (beneficiaryAccountId) {
    const { data: existingContrib, error: contribLookupErr } = await supabase
      .from("roebel_verein_contributions")
      .select("id, pending_amount_cents")
      .eq("beneficiary_account_id", beneficiaryAccountId)
      .maybeSingle();

    if (contribLookupErr) {
      console.error(
        "❌ [RoebelCard.webhook] contribution lookup failed:",
        contribLookupErr,
      );
    } else if (existingContrib) {
      const { error: contribUpdateErr } = await supabase
        .from("roebel_verein_contributions")
        .update({
          pending_amount_cents:
            Number(existingContrib.pending_amount_cents) + vereineCents,
        })
        .eq("id", existingContrib.id);
      if (contribUpdateErr) {
        console.error(
          "❌ [RoebelCard.webhook] contribution update failed:",
          contribUpdateErr,
        );
      }
    } else {
      const { error: contribInsertErr } = await supabase
        .from("roebel_verein_contributions")
        .insert({
          beneficiary_account_id: beneficiaryAccountId,
          pending_amount_cents: vereineCents,
          paid_amount_cents: 0,
        });
      if (contribInsertErr) {
        console.error(
          "❌ [RoebelCard.webhook] contribution insert failed:",
          contribInsertErr,
        );
      }
    }
  } else {
    // Röbeler Topf — singleton fund + ledger entry.
    const { data: topf, error: topfLookupErr } = await supabase
      .from("roebel_verein_fund")
      .select("id, balance_cents")
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (topfLookupErr || !topf) {
      console.error(
        "❌ [RoebelCard.webhook] topf lookup failed:",
        topfLookupErr,
      );
    } else {
      const { error: topfUpdateErr } = await supabase
        .from("roebel_verein_fund")
        .update({
          balance_cents: Number(topf.balance_cents) + vereineCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", topf.id);
      if (topfUpdateErr) {
        console.error(
          "❌ [RoebelCard.webhook] topf update failed:",
          topfUpdateErr,
        );
      }
      const { error: entryErr } = await supabase
        .from("roebel_verein_fund_entries")
        .insert({
          purchase_id: purchaseId,
          amount_cents: vereineCents,
        });
      if (entryErr) {
        console.error(
          "❌ [RoebelCard.webhook] topf entry insert failed:",
          entryErr,
        );
      }
    }
  }

  console.log(
    "✅ [RoebelCard.webhook] credited",
    faceCents,
    "cents to card",
    cardId,
    "purchase",
    purchaseId,
  );

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "roebel-card/webhook",
    has_secret: !!(
      process.env.STRIPE_ROEBEL_CARD_WEBHOOK_SECRET ??
      process.env.STRIPE_WEBHOOK_SECRET
    ),
    client_reference_id_format: "rc1|w:<wallet>|b:<verein_uuid_or_TOPF>",
  });
}
