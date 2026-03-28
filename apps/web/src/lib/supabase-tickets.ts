import { supabase } from "./supabase";
import type {
  EventTicket,
  CreateTicketInput,
  TicketVerificationResult,
  TicketRedemptionResult,
} from "@/types/ticket-types";
import { TICKET_CONFIG } from "./stripe";

/**
 * Create a new ticket in the database
 */
export async function createTicket(
  input: CreateTicketInput
): Promise<{ success: boolean; data?: EventTicket; error?: string }> {
  console.log("🎫 [Supabase] Creating ticket:", input.ticket_code);

  // Get the day config for the correct date
  const dayConfig = TICKET_CONFIG.days[input.event_day];

  try {
    const { data, error } = await supabase
      .from("event_tickets")
      .insert({
        ticket_code: input.ticket_code,
        event_name: TICKET_CONFIG.event_name,
        event_day: input.event_day,
        event_date: dayConfig.date,
        event_location: TICKET_CONFIG.event_location,
        buyer_email: input.buyer_email,
        buyer_name: input.buyer_name || null,
        stripe_session_id: input.stripe_session_id || null,
        stripe_payment_intent: input.stripe_payment_intent || null,
        amount_paid: input.amount_paid,
        currency: input.currency || "eur",
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("❌ [Supabase] Error creating ticket:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ [Supabase] Ticket created successfully");
    return { success: true, data: data as EventTicket };
  } catch (error) {
    console.error("❌ [Supabase] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get a ticket by its code
 */
export async function getTicketByCode(
  ticketCode: string
): Promise<TicketVerificationResult> {
  console.log("🔍 [Supabase] Fetching ticket:", ticketCode);

  try {
    const { data, error } = await supabase
      .from("event_tickets")
      .select("*")
      .eq("ticket_code", ticketCode.toUpperCase())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        console.log("⚠️ [Supabase] Ticket not found:", ticketCode);
        return { success: false, error: "Ticket nicht gefunden" };
      }
      console.error("❌ [Supabase] Error fetching ticket:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ [Supabase] Ticket fetched successfully");
    return { success: true, ticket: data as EventTicket };
  } catch (error) {
    console.error("❌ [Supabase] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get a ticket by Stripe session ID
 */
export async function getTicketBySessionId(
  sessionId: string
): Promise<TicketVerificationResult> {
  console.log("🔍 [Supabase] Fetching ticket by session:", sessionId);

  try {
    const { data, error } = await supabase
      .from("event_tickets")
      .select("*")
      .eq("stripe_session_id", sessionId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { success: false, error: "Ticket nicht gefunden" };
      }
      console.error("❌ [Supabase] Error fetching ticket:", error);
      return { success: false, error: error.message };
    }

    return { success: true, ticket: data as EventTicket };
  } catch (error) {
    console.error("❌ [Supabase] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Redeem a ticket (mark as used)
 */
export async function redeemTicket(
  ticketCode: string,
  redeemedBy?: string
): Promise<TicketRedemptionResult> {
  console.log("🎟️ [Supabase] Redeeming ticket:", ticketCode);

  try {
    // First, check current status
    const { data: existingTicket, error: fetchError } = await supabase
      .from("event_tickets")
      .select("*")
      .eq("ticket_code", ticketCode.toUpperCase())
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return {
          success: false,
          message: "Ticket nicht gefunden",
          error: "Ticket nicht gefunden",
        };
      }
      return { success: false, message: fetchError.message, error: fetchError.message };
    }

    const ticket = existingTicket as EventTicket;

    // Check if already redeemed
    if (ticket.status === "redeemed") {
      const redeemedDate = ticket.redeemed_at
        ? new Date(ticket.redeemed_at).toLocaleString("de-DE", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "unbekannt";
      return {
        success: false,
        message: `Ticket bereits eingelöst am ${redeemedDate}`,
        ticket,
        error: "Ticket bereits eingelöst",
      };
    }

    // Check if cancelled or refunded
    if (ticket.status === "cancelled" || ticket.status === "refunded") {
      return {
        success: false,
        message: `Ticket wurde ${ticket.status === "cancelled" ? "storniert" : "erstattet"}`,
        ticket,
        error: `Ticket ${ticket.status}`,
      };
    }

    // Redeem the ticket
    const { data: updatedTicket, error: updateError } = await supabase
      .from("event_tickets")
      .update({
        status: "redeemed",
        redeemed_at: new Date().toISOString(),
        redeemed_by: redeemedBy || null,
        updated_at: new Date().toISOString(),
      })
      .eq("ticket_code", ticketCode.toUpperCase())
      .select()
      .single();

    if (updateError) {
      console.error("❌ [Supabase] Error redeeming ticket:", updateError);
      return {
        success: false,
        message: "Fehler beim Einlösen",
        error: updateError.message,
      };
    }

    console.log("✅ [Supabase] Ticket redeemed successfully");
    return {
      success: true,
      message: "Ticket erfolgreich eingelöst!",
      ticket: updatedTicket as EventTicket,
    };
  } catch (error) {
    console.error("❌ [Supabase] Unexpected error:", error);
    return {
      success: false,
      message: "Unerwarteter Fehler",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all tickets for an email
 */
export async function getTicketsByEmail(
  email: string
): Promise<{ success: boolean; tickets?: EventTicket[]; error?: string }> {
  console.log("📋 [Supabase] Fetching tickets for email:", email);

  try {
    const { data, error } = await supabase
      .from("event_tickets")
      .select("*")
      .eq("buyer_email", email.toLowerCase())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ [Supabase] Error fetching tickets:", error);
      return { success: false, error: error.message };
    }

    return { success: true, tickets: data as EventTicket[] };
  } catch (error) {
    console.error("❌ [Supabase] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a ticket code already exists
 */
export async function ticketCodeExists(ticketCode: string): Promise<boolean> {
  const { count } = await supabase
    .from("event_tickets")
    .select("*", { count: "exact", head: true })
    .eq("ticket_code", ticketCode.toUpperCase());

  return (count || 0) > 0;
}

/**
 * Get ticket statistics
 */
export async function getTicketStats(): Promise<{
  success: boolean;
  data?: {
    total: number;
    active: number;
    redeemed: number;
    cancelled: number;
  };
  error?: string;
}> {
  console.log("📊 [Supabase] Fetching ticket statistics");

  try {
    const [totalRes, activeRes, redeemedRes, cancelledRes] = await Promise.all([
      supabase.from("event_tickets").select("*", { count: "exact", head: true }),
      supabase
        .from("event_tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("event_tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "redeemed"),
      supabase
        .from("event_tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["cancelled", "refunded"]),
    ]);

    return {
      success: true,
      data: {
        total: totalRes.count || 0,
        active: activeRes.count || 0,
        redeemed: redeemedRes.count || 0,
        cancelled: cancelledRes.count || 0,
      },
    };
  } catch (error) {
    console.error("❌ [Supabase] Error fetching stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
