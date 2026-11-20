/**
 * Android: redraw every placed "Mini Apps" widget with the new payload.
 */
import type { WidgetPayload } from './widget-payload';

export async function pushToPlatform(payload: WidgetPayload): Promise<void> {
  try {
    // Lazy: the native module only exists in binaries ≥ 3.10.0.
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { renderMiniApps, WIDGET_NAME } = require('../widgets/task-handler') as typeof import('../widgets/task-handler');
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: (info) => renderMiniApps(payload, info.width, info.height),
    });
  } catch (e) {
    console.warn('[widget] Android push failed:', e);
  }
}
