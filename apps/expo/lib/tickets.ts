import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { postSigned, type ApiResult, type SigningAccount } from './signed-request';

export interface TicketTypeRow {
  id: string; event_id: string; account_id: string; name: string; description: string | null; price_cents: number; currency: string;
  capacity: number | null; per_order_max: number; sales_start: string | null; sales_end: string | null; sort_order: number; is_active: boolean;
}
export interface TicketTypeInput {
  id?: string; name: string; description?: string | null; price_cents: number; capacity?: number | null; per_order_max?: number; sales_end?: string | null; sort_order?: number; is_active?: boolean;
}
export interface TicketView { id: string; code: string; qr: string; status: 'issued' | 'checked_in' | 'refunded' | 'void'; checked_in_at: string | null; ticket_type_name: string }
export interface OrderView {
  id: string; status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'; quantity: number; amount_cents: number; currency: string; rail: string;
  expires_at: string | null; created_at: string;
  event: { id: string; title: string; date: string | null; time: string | null; location: string | null; image_url: string | null };
  ticket_type_name: string; tickets: TicketView[];
}
/** One order as the ORGANISER sees it: money and door numbers, never the buyer's identity. */
export interface OrgOrderView {
  id: string; status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'; quantity: number;
  amount_cents: number; currency: string; rail: string;
  created_at: string; paid_at: string | null; refunded_at: string | null;
  ticket_type_name: string; tickets_total: number; tickets_checked_in: number;
}
export interface CheckoutResult { order_id: string; status: 'pending' | 'paid'; url: string | null; expires_at: string | null; amount_cents: number; fee_cents: number }
export interface CheckinResult { result: 'ok' | 'already_checked_in' | 'invalid' | 'refunded'; ticket?: TicketView; event_title?: string; checked_in_count?: number; issued_count?: number }

export async function fetchTicketTypes(eventId: string): Promise<TicketTypeRow[]> {
  const { data, error } = await supabase.from('ticket_types').select('*').eq('event_id', eventId).eq('is_active', true).order('sort_order');
  if (error) { console.error('fetchTicketTypes', error); return []; }
  return (data ?? []) as TicketTypeRow[];
}
/**
 * Ticket types for the ORG editor. Goes through the signed API instead of the anon table read,
 * because the anon policy only exposes is_active rows — the org has to see its deactivated
 * types too, or saving would silently re-create them.
 */
export function fetchTicketTypesForOrg(account: SigningAccount, eventId: string) {
  return postSigned<{ types: TicketTypeRow[] }>('/api/tickets/types', account, 'ticket_types_list', { event_id: eventId });
}
export function upsertTicketTypes(account: SigningAccount, eventId: string, types: TicketTypeInput[]) {
  return postSigned<{ types: TicketTypeRow[] }>('/api/tickets/types', account, 'ticket_types_upsert', { event_id: eventId, types });
}
export function startCheckout(account: SigningAccount, input: { ticketTypeId: string; quantity: number; email?: string | null }) {
  return postSigned<CheckoutResult>('/api/tickets/checkout', account, 'checkout', {
    ticket_type_id: input.ticketTypeId, quantity: input.quantity, ...(input.email ? { buyer_email: input.email } : {}),
  });
}
export async function openCheckout(url: string, orderId: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, `roebel://tickets/${orderId}`, { showInRecents: true });
}
export function fetchOrder(account: SigningAccount, orderId: string) {
  return postSigned<OrderView>('/api/tickets/order', account, 'order_status', { order_id: orderId });
}
export function fetchMyTickets(account: SigningAccount) {
  return postSigned<{ orders: OrderView[] }>('/api/tickets/mine', account, 'tickets_list', {});
}
export function checkInTicket(account: SigningAccount, payload: string) {
  return postSigned<CheckinResult>('/api/tickets/checkin', account, 'checkin', { payload });
}
/** Orders for one event, owner/admin only. */
export function fetchOrgOrders(account: SigningAccount, eventId: string) {
  return postSigned<{ orders: OrgOrderView[] }>('/api/tickets/orders', account, 'orders_list', { event_id: eventId });
}
/** `force` overrides the server's TICKETS_CHECKED_IN guard — only after a second confirmation. */
export function refundOrder(account: SigningAccount, orderId: string, opts?: { force?: boolean }) {
  return postSigned<{ refunded: true }>('/api/tickets/refund', account, 'refund_order', {
    order_id: orderId, ...(opts?.force ? { force: true } : {}),
  });
}

export function formatCents(cents: number): string {
  if (!cents) return 'Kostenlos';
  return `${Math.floor(cents / 100)}${cents % 100 ? ',' + String(cents % 100).padStart(2, '0') : ''} €`;
}
const PAYLOAD_RE = /^roebel-ticket:v1:([A-HJ-NP-Z2-9]{10}):([0-9a-f]{16})$/;
export function parseTicketPayload(data: string): { code: string } | null {
  const m = PAYLOAD_RE.exec(data.trim());
  return m ? { code: m[1] } : null;
}
export function isTicketPayload(data: string): boolean { return PAYLOAD_RE.test(data.trim()); }
export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Zahlung offen';
    case 'paid': return 'Bezahlt';
    case 'expired': return 'Abgelaufen';
    case 'cancelled': return 'Abgebrochen';
    case 'refunded': return 'Erstattet';
    default: return status;
  }
}
