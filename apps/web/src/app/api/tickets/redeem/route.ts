import { NextRequest, NextResponse } from "next/server";
import { redeemTicket } from "@/lib/supabase-tickets";

export async function POST(request: NextRequest) {
  console.log("🎟️ [Redeem] Processing redemption request");

  try {
    const body = await request.json();
    const { code, redeemed_by } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Ticket-Code erforderlich" },
        { status: 400 }
      );
    }

    const result = await redeemTicket(code, redeemed_by);

    if (!result.success) {
      // Determine appropriate status code
      const statusCode = result.error?.includes("nicht gefunden") ? 404 : 400;
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          error: result.error,
          ticket: result.ticket
            ? {
                ticket_code: result.ticket.ticket_code,
                status: result.ticket.status,
                redeemed_at: result.ticket.redeemed_at,
              }
            : undefined,
        },
        { status: statusCode }
      );
    }

    console.log("✅ [Redeem] Ticket redeemed:", code);

    return NextResponse.json({
      success: true,
      message: result.message,
      ticket: {
        ticket_code: result.ticket!.ticket_code,
        event_name: result.ticket!.event_name,
        event_date: result.ticket!.event_date,
        event_location: result.ticket!.event_location,
        status: result.ticket!.status,
        redeemed_at: result.ticket!.redeemed_at,
      },
    });
  } catch (error) {
    console.error("❌ [Redeem] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Fehler beim Einlösen des Tickets",
      },
      { status: 500 }
    );
  }
}
