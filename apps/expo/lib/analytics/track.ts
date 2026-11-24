/**
 * Org analytics events → public.track_events (supabase/migrations/20261124_org_analytics.sql).
 *
 * Fire-and-forget and batched: flush after 3 s or at 10 queued events, and when the app goes to
 * the background. Views and impressions of the same object count at most once per 10 s per device
 * (scroll jitter); every other metric counts each time. Failures are swallowed, nothing retries.
 * Likes, comments, follows and event interest are counted by database triggers, not from here.
 */
import { AppState } from 'react-native';
import { supabase } from '../supabase';

export type TrackObjectType = 'post' | 'deal' | 'listing' | 'event' | 'profile' | 'mini_app' | 'ticket' | 'link' | 'org';
export type TrackMetric = 'view' | 'impression' | 'click' | 'link_tap' | 'share' | 'open' | 'save';

export type TrackInput = { objectType: TrackObjectType; objectId: string; metric: TrackMetric; surface?: string };

const FLUSH_DELAY_MS = 3000;
const FLUSH_THRESHOLD = 10;
const VIEW_THROTTLE_MS = 10_000;

type Wire = { object_type: TrackObjectType; object_id: string; metric: TrackMetric; surface?: string };

let wallet: string | null = null;
let enabled = true;
let queue: Wire[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const lastCounted = new Map<string, number>();

export function setTrackerWallet(w: string | null | undefined): void {
  wallet = w ? w.toLowerCase() : null;
}

export function setTrackingEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    queue = [];
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

export function resetTracker(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = [];
  lastCounted.clear();
}

export function trackEvent(e: TrackInput): void {
  if (!enabled || !e.objectId) return;
  if (e.metric === 'view' || e.metric === 'impression') {
    const key = `${e.objectType}:${e.objectId}:${e.metric}`;
    const now = Date.now();
    const last = lastCounted.get(key);
    if (last !== undefined && now - last < VIEW_THROTTLE_MS) return;
    lastCounted.set(key, now);
  }
  const wire: Wire = { object_type: e.objectType, object_id: e.objectId, metric: e.metric };
  if (e.surface) wire.surface = e.surface;
  queue.push(wire);
  if (queue.length >= FLUSH_THRESHOLD) {
    flushEvents();
    return;
  }
  if (!timer) timer = setTimeout(flushEvents, FLUSH_DELAY_MS);
}

export function flushEvents(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!enabled || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    Promise.resolve(supabase.rpc('track_events', { p_events: batch, p_wallet: wallet }))
      .then((res: any) => {
        if (res?.error && __DEV__) console.warn('[track] flush failed', res.error);
      })
      .catch(() => {});
  } catch {
    // never throw into the UI
  }
}

// Don't lose a pending batch when the app is backgrounded.
AppState.addEventListener?.('change', (state) => {
  if (state === 'background') flushEvents();
});
