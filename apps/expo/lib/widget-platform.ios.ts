/**
 * iOS: write the payload into the shared App Group and reload the WidgetKit timeline
 * (targets/widget/MiniAppsWidget.swift reads the same key).
 */
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
