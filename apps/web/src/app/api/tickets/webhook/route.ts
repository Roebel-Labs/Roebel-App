import { NextRequest, NextResponse } from "next/server";
import { stripe, generateTicketCode, TICKET_CONFIG } from "@/lib/stripe";
import { createTicket, ticketCodeExists } from "@/lib/supabase-tickets";
import { sendTicketEmail } from "@/lib/ticket-email";
import Stripe from "stripe";

/**
 * GET handler - health check for webhook configuration
 */
export async function GET() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  return NextResponse.json({
    status: "ok",
    config: {
      STRIPE_SECRET_KEY: stripeKey ? `set (${stripeKey.substring(0, 10)}...)` : "MISSING",
      STRIPE_WEBHOOK_SECRET: webhookSecret ? `set (${webhookSecret.substring(0, 10)}..., length: ${webhookSecret.length})` : "MISSING",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? "set" : "MISSING",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey ? "set" : "MISSING",
      RESEND_API_KEY: resendKey ? "set" : "MISSING",
    },
  });
}

export async function POST(request: NextRequest) {
  console.log("🔔 [Webhook] Received Stripe webhook");

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  console.log("🔔 [Webhook] Body length:", body.length, "Signature present:", !!signature);

  if (!signature) {
    console.error("❌ [Webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("❌ [Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  console.log("🔔 [Webhook] Secret starts with:", webhookSecret.substring(0, 10), "length:", webhookSecret.length);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log("✅ [Webhook] Event verified:", event.type);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [Webhook] Signature verification failed:", errMsg);
    console.error("❌ [Webhook] Sig header (first 30):", signature.substring(0, 30));
    return NextResponse.json({ error: "Invalid signature", details: errMsg }, { status: 400 });
  }

  // Handle the checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("💳 [Webhook] Processing completed checkout:", session.id);

    try {
      // Get customer email
      const customerEmail = session.customer_details?.email || session.customer_email;
      if (!customerEmail) {
        console.error("❌ [Webhook] No customer email found");
        return NextResponse.json({ error: "No email" }, { status: 400 });
      }

      const customerName = session.customer_details?.name || undefined;
      const quantity = parseInt(session.metadata?.quantity || "1", 10);

      // Get event_day from session metadata (set on Payment Link)
      const eventDay = (session.metadata?.event_day as "saturday" | "sunday") || "saturday";

      // Create tickets for each quantity purchased
      const createdTickets = [];
      for (let i = 0; i < quantity; i++) {
        // Generate unique ticket code
        let ticketCode = generateTicketCode();
        let attempts = 0;
        while ((await ticketCodeExists(ticketCode)) && attempts < 10) {
          ticketCode = generateTicketCode();
          attempts++;
        }

        if (attempts >= 10) {
          console.error("❌ [Webhook] Could not generate unique ticket code");
          continue;
        }

        // Create ticket in database
        const ticketResult = await createTicket({
          ticket_code: ticketCode,
          event_day: eventDay,
          buyer_email: customerEmail.toLowerCase(),
          buyer_name: customerName,
          stripe_session_id: i === 0 ? session.id : `${session.id}_${i}`,
          stripe_payment_intent: session.payment_intent as string,
          amount_paid: TICKET_CONFIG.price_cents,
          currency: TICKET_CONFIG.currency,
        });

        if (ticketResult.success && ticketResult.data) {
          createdTickets.push(ticketResult.data);
          console.log("✅ [Webhook] Ticket created:", ticketCode);
        } else {
          console.error("❌ [Webhook] Failed to create ticket:", ticketResult.error);
        }
      }

      // Send confirmation emails for each ticket
      for (const ticket of createdTickets) {
        try {
          await sendTicketEmail(ticket);
          console.log("📧 [Webhook] Email sent for ticket:", ticket.ticket_code);
        } catch (emailError) {
          console.error("❌ [Webhook] Failed to send email:", emailError);
          // Don't fail the webhook - ticket is created, email can be resent
        }
      }

      console.log(
        `✅ [Webhook] Successfully processed ${createdTickets.length} tickets`
      );
    } catch (error) {
      console.error("❌ [Webhook] Error processing checkout:", error);
      // Return 200 to prevent Stripe from retrying
      // The error is logged and can be handled manually
    }
  }

  // Handle payment intent succeeded (alternative event)
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.log("💰 [Webhook] Payment intent succeeded:", paymentIntent.id);
    // This is handled by checkout.session.completed, but log for debugging
  }

  // Handle refunds
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    console.log("💸 [Webhook] Charge refunded:", charge.id);
    // TODO: Update ticket status to refunded
  }

  return NextResponse.json({ received: true });
}
