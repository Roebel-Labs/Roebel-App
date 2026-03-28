import { NextRequest, NextResponse } from "next/server";
import { stripe, TICKET_CONFIG } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  console.log("🎫 [Checkout] Creating checkout session");

  try {
    const body = await request.json().catch(() => ({}));
    const { quantity = 1 } = body;

    // Validate quantity
    if (quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: "Ungültige Ticketanzahl (1-10)" },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app";

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: TICKET_CONFIG.currency,
            product_data: {
              name: TICKET_CONFIG.event_name,
              description: `7. & 8. März 2026 | ${TICKET_CONFIG.event_location}`,
              images: [`${baseUrl}/psv/desktop-bg.png`],
            },
            unit_amount: TICKET_CONFIG.price_cents,
          },
          quantity,
        },
      ],
      mode: "payment",
      success_url: `${baseUrl}/landesmeisterschaft?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/landesmeisterschaft?cancelled=true`,
      customer_email: undefined,
      metadata: {
        event_name: TICKET_CONFIG.event_name,
        event_location: TICKET_CONFIG.event_location,
        quantity: quantity.toString(),
      },
      locale: "de",
      allow_promotion_codes: true,
    });

    console.log("✅ [Checkout] Session created:", session.id);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("❌ [Checkout] Error:", error);
    return NextResponse.json(
      {
        error: "Fehler beim Erstellen der Checkout-Session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
