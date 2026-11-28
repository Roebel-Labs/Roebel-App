// Native booking on a seller's Calendly (first: Anna Janzen). Server: /api/booking/* (apps/web). The
// Calendly token stays on the server; the app only sees event types, free slots and booking results.

import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { BOOKING_SCOPE, postSigned, type SigningAccount } from './signed-request';

const DEFAULT_API_BASE_URL = 'https://roebel.app';
function apiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  return env && env.length > 0 ? env.replace(/\/$/, '') : DEFAULT_API_BASE_URL;
}

async function request<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20000); // RN fetch has no timeout
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; message?: string } | null;
    if (!res.ok || !body?.ok) return { ok: false, status: res.status, message: body?.message ?? 'Etwas ist schiefgelaufen. Bitte versuche es erneut.' };
    return { ok: true, data: body.data as T };
  } catch {
    return { ok: false, status: 0, message: 'Keine Verbindung. Bitte versuche es erneut.' };
  } finally {
    clearTimeout(timer);
  }
}

export interface BookingEventType {
  uri: string;
  name: string;
  duration: number;
  description: string | null;
  location_kind: string | null; // 'outbound_call' = the seller calls
  question: string | null;
}

export interface BookingInfo {
  seller: { account_id: string; name: string | null; avatar_url: string | null };
  event_types: BookingEventType[];
  event_type: string;
  slots: string[]; // ISO start times, next 14 days
}

export function fetchBookingInfo(sellerWallet: string, opts?: { eventType?: string; slots?: boolean }) {
  const q = new URLSearchParams();
  if (opts?.eventType) q.set('event_type', opts.eventType);
  if (opts?.slots === false) q.set('slots', '0');
  const qs = q.toString();
  return request<BookingInfo>(`/api/booking/${sellerWallet.toLowerCase()}${qs ? `?${qs}` : ''}`);
}

const availability = new Map<string, boolean>();

/** True when the seller has booking connected (cached per app start). Used to show "Termin buchen". */
export function useBookingAvailable(sellerWallet: string | null | undefined): boolean {
  const key = sellerWallet?.toLowerCase() ?? '';
  const [on, setOn] = useState<boolean>(key ? availability.get(key) ?? false : false);
  useEffect(() => {
    if (!key) return;
    if (availability.has(key)) {
      setOn(availability.get(key)!);
      return;
    }
    let alive = true;
    void fetchBookingInfo(key, { slots: false }).then((r) => {
      const v = r.ok && r.data.event_types.length > 0;
      availability.set(key, v);
      if (alive) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return on;
}

export type BookResult =
  | { status: 'booked'; booking_id: string }
  | { status: 'needs_confirmation'; booking_id: string; url: string };

export function bookSlot(sellerWallet: string, input: {
  eventType: string; startTime: string; name: string; email: string; phone?: string; answer?: string; bookerWallet?: string | null;
}) {
  return request<BookResult>(`/api/booking/${sellerWallet.toLowerCase()}/book`, {
    method: 'POST',
    timeoutMs: 30000,
    body: {
      event_type: input.eventType,
      start_time: input.startTime,
      name: input.name,
      email: input.email,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.answer ? { answer: input.answer } : {}),
      ...(input.bookerWallet ? { booker_wallet: input.bookerWallet.toLowerCase() } : {}),
    },
  });
}

/** Calendly's page for exactly the chosen slot (fallback until the seller's token can write). */
export async function openCalendlyConfirm(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      dismissButtonStyle: 'done',
    });
  } catch {
    // Browser unavailable: confirmBooking below still reports the real state.
  }
}

/** Polls the server until Calendly shows the booking (or gives up). */
export async function confirmBooking(bookingId: string): Promise<'booked' | 'pending' | 'failed'> {
  for (const wait of [0, 1500, 3000, 5000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const r = await request<{ status: string }>('/api/booking/confirm', { method: 'POST', body: { booking_id: bookingId } });
    if (r.ok && r.data.status === 'booked') return 'booked';
    if (r.ok && (r.data.status === 'failed' || r.data.status === 'cancelled')) return 'failed';
  }
  return 'pending';
}

export function sendBookingAutoReply(bookingId: string, conversationId: string) {
  return request<{ sent: boolean }>('/api/booking/auto-reply', { method: 'POST', body: { booking_id: bookingId, conversation_id: conversationId } });
}

/** Chat payload of the booker's booking message (rendered as BookingCard). */
export interface BookingMessage {
  type: 'booking';
  bookingId: string;
  title: string; // event type name
  startTime: string;
  durationMin: number;
  locationKind: string | null;
  listingId?: string;
  listingTitle?: string;
  imageUrl?: string;
}

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Calendar parts of an ISO time in Europe/Berlin (the app is local to Röbel). */
export function berlinParts(iso: string): { key: string; y: number; m: number; d: number; wd: number; hm: string } {
  const f = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month) - 1, d = Number(p.day);
  const wd = new Date(Date.UTC(y, m, d)).getUTCDay();
  return { key: `${p.year}-${p.month}-${p.day}`, y, m, d, wd, hm: `${p.hour}:${p.minute}` };
}

export function formatBookingWhen(iso: string, durationMin: number): string {
  const s = berlinParts(iso);
  const e = berlinParts(new Date(new Date(iso).getTime() + durationMin * 60000).toISOString());
  return `${WD[s.wd]}, ${s.d}. ${MON[s.m]}, ${s.hm}–${e.hm} Uhr`;
}

export const GERMAN_WEEKDAYS = WD;
export const GERMAN_MONTHS = MON;

// ─── Settings: connect your own Calendly (signed, own personal account only) ───


export function connectCalendly(account: SigningAccount, token: string) {
  availability.delete(account.address.toLowerCase());
  return postSigned<{ connected: true; event_types: BookingEventType[] }>('/api/booking/settings', account, 'booking_connect', { token: token.trim() }, BOOKING_SCOPE);
}

export function disconnectCalendly(account: SigningAccount) {
  availability.delete(account.address.toLowerCase());
  return postSigned<{ connected: false }>('/api/booking/settings', account, 'booking_disconnect', {}, BOOKING_SCOPE);
}
