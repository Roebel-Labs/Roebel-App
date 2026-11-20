/**
 * iOS: write the payload into the shared App Group and reload the WidgetKit timeline
 * (targets/widget/MiniAppsWidget.swift reads the same key).
 */
import { EVENTS_PAYLOAD_KEY, LUNCH_PAYLOAD_KEY, type EventsPayload, type LunchPayload } from './widget-content';
import type { WidgetPayload } from './widget-payload';

export const WIDGET_APP_GROUP = 'group.com.maxbrych.roebelonchain.widgets';

export async function pushToPlatform(payload: WidgetPayload): Promise<void> {
  try {
    // Lazy: the native module only exists in binaries ≥ 3.10.0; a top-level import would
    // throw at launch if this JS ever reached an older runtime.
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    new ExtensionStorage(WIDGET_APP_GROUP).set('widget.payload.v1', JSON.stringify(payload));
    ExtensionStorage.reloadWidget('MiniApps');
  } catch (e) {
    // A binary without the widget extension (older build) has no App Group: ignore.
    console.warn('[widget] iOS push failed:', e);
  }
}

/** Writes one payload into the App Group and reloads that widget kind (see targets/widget). */
function pushIos(key: string, json: string, kind: string): void {
  try {
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    new ExtensionStorage(WIDGET_APP_GROUP).set(key, json);
    ExtensionStorage.reloadWidget(kind);
  } catch (e) {
    console.warn(`[widget] iOS push ${kind} failed:`, e);
  }
}

/** The page (restaurant) lives in the App Group and is stepped by the widget's own ‹ › buttons. */
export async function pushLunchToPlatform(payload: LunchPayload, _page: number): Promise<void> {
  pushIos(LUNCH_PAYLOAD_KEY, JSON.stringify(payload), 'Mittagstisch');
}

export async function pushEventsToPlatform(payload: EventsPayload): Promise<void> {
  pushIos(EVENTS_PAYLOAD_KEY, JSON.stringify(payload), 'EventsThisWeek');
}
