/**
 * Android: redraw every placed "Mini Apps" widget with the new payload.
 */
import type { EventsPayload, LunchPayload } from './widget-content';
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

export async function pushLunchToPlatform(payload: LunchPayload, page: number): Promise<void> {
  try {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { renderLunch, LUNCH_WIDGET_NAME } = require('../widgets/content-widgets') as typeof import('../widgets/content-widgets');
    await requestWidgetUpdate({
      widgetName: LUNCH_WIDGET_NAME,
      renderWidget: (info) => renderLunch(payload, page, info.width, info.height),
    });
  } catch (e) {
    console.warn('[widget] Android lunch push failed:', e);
  }
}

export async function pushEventsToPlatform(payload: EventsPayload): Promise<void> {
  try {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { renderEvents, EVENTS_WIDGET_NAME } = require('../widgets/content-widgets') as typeof import('../widgets/content-widgets');
    await requestWidgetUpdate({
      widgetName: EVENTS_WIDGET_NAME,
      renderWidget: (info) => renderEvents(payload, info.width, info.height),
    });
  } catch (e) {
    console.warn('[widget] Android events push failed:', e);
  }
}
