import { NextRequest, NextResponse } from "next/server";
import { getTicketByCode } from "@/lib/supabase-tickets";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { success: false, error: "Ticket-Code erforderlich" },
      { status: 400 }
    );
  }

  console.log("🔍 [Verify] Checking ticket:", code);

  const result = await getTicketByCode(code);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error || "Ticket nicht gefunden" },
      { status: 404 }
    );
  }

  // Return ticket info (hide sensitive payment details)
  const ticket = result.ticket!;
  return NextResponse.json({
    success: true,
    ticket: {
      ticket_code: ticket.ticket_code,
      event_name: ticket.event_name,
      event_day: ticket.event_day,
      event_date: ticket.event_date,
      event_location: ticket.event_location,
      buyer_email: maskEmail(ticket.buyer_email),
      buyer_name: ticket.buyer_name,
      status: ticket.status,
      redeemed_at: ticket.redeemed_at,
      created_at: ticket.created_at,
    },
  });
}

// Mask email for privacy (show first 2 chars + domain)
function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!domain) return "***@***";
  const masked =
    localPart.slice(0, 2) + "***" + (localPart.length > 2 ? localPart.slice(-1) : "");
  return `${masked}@${domain}`;
}
