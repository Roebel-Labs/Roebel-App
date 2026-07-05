// Data access for the dev-ticket board. Service-role only — the tables have
// RLS enabled with no policies, so the anon key can never touch them.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DevTicket,
  DevTicketActivity,
  DevTicketStatus,
} from "@/types/dev-tickets";

export async function listTickets(): Promise<DevTicket[]> {
  const { data, error } = await createAdminClient()
    .from("dev_tickets")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DevTicket[];
}

export async function getTicket(id: string): Promise<DevTicket | null> {
  const { data, error } = await createAdminClient()
    .from("dev_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as DevTicket) ?? null;
}

export async function createTicket(
  fields: Partial<DevTicket>
): Promise<DevTicket> {
  const { data, error } = await createAdminClient()
    .from("dev_tickets")
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data as DevTicket;
}

export async function updateTicket(
  id: string,
  fields: Partial<DevTicket>
): Promise<DevTicket> {
  const { data, error } = await createAdminClient()
    .from("dev_tickets")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DevTicket;
}

export async function deleteTicket(id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("dev_tickets")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function listActivity(
  ticketId: string
): Promise<DevTicketActivity[]> {
  const { data, error } = await createAdminClient()
    .from("dev_ticket_activity")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DevTicketActivity[];
}

export async function addActivity(
  ticketId: string,
  author: DevTicketActivity["author"],
  body: string
): Promise<void> {
  const { error } = await createAdminClient()
    .from("dev_ticket_activity")
    .insert({ ticket_id: ticketId, author, body });
  if (error) throw error;
}

export async function getFeedbackRow(
  id: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await createAdminClient()
    .from("feedback")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Append position for a column: max(position)+1024, or 1024 for empty. */
export async function nextPositionFor(
  status: DevTicketStatus
): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("dev_tickets")
    .select("position")
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.length ? (data[0].position as number) + 1024 : 1024;
}
