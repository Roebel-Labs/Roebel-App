/**
 * Headless handler for the Android "Mini Apps" widget. Runs without the app UI when the
 * launcher adds, resizes or periodically updates the widget (updatePeriodMillis = 30 min):
 * periodic updates re-sync for the last signed-in wallet so unread dots appear even while
 * the app is closed; everything else redraws from the stored payload.
 */
// The widget library calls these components as plain functions; the React Compiler's
// memo hook would make every render throw "Invalid Hook Call" (blank widget).
'use no memo';

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getStoredWidgetWallet, readStoredPayload, syncWidget } from '@/lib/widget-sync';
import type { WidgetPayload } from '@/lib/widget-payload';
import { MiniAppsWidget } from './MiniAppsWidget';
import {
  EVENTS_WIDGET_NAME,
  LUNCH_NEXT,
  LUNCH_PREV,
  LUNCH_WIDGET_NAME,
  renderEvents,
  renderLunch,
} from './content-widgets';
import { readEventsPayload, readLunchPage, readLunchPayload, stepLunchPage } from '@/lib/widget-content-sync';

export const WIDGET_NAME = 'MiniApps';

export function renderMiniApps(payload: WidgetPayload | null, width: number, height: number) {
  return {
    light: <MiniAppsWidget payload={payload} width={width} height={height} dark={false} />,
    dark: <MiniAppsWidget payload={payload} width={width} height={height} dark />,
  };
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;
  if (widgetInfo.widgetName === LUNCH_WIDGET_NAME || widgetInfo.widgetName === EVENTS_WIDGET_NAME) {
    await contentTaskHandler(props);
    return;
  }
  if (widgetInfo.widgetName !== WIDGET_NAME) return;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      let payload = await readStoredPayload();
      if (widgetAction !== 'WIDGET_RESIZED') {
        // syncWidget also calls requestWidgetUpdate; render here too so the launcher
        // never waits on the network for a first frame.
        renderWidget(renderMiniApps(payload, widgetInfo.width, widgetInfo.height));
        const wallet = await getStoredWidgetWallet();
        payload = (await syncWidget(wallet || null)) ?? payload;
      }
      renderWidget(renderMiniApps(payload, widgetInfo.width, widgetInfo.height));
      break;
    }
    default:
      break;
  }
}

/**
 * Mittagstisch / Diese Woche: draw from storage at once, re-sync on add + periodic
 * update (syncWidget redraws every widget), step the restaurant page on ‹ ›.
 */
async function contentTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget, clickAction } = props;
  const lunch = widgetInfo.widgetName === LUNCH_WIDGET_NAME;
  const draw = async () => {
    if (lunch) renderWidget(renderLunch(await readLunchPayload(), await readLunchPage(), widgetInfo.width, widgetInfo.height));
    else renderWidget(renderEvents(await readEventsPayload(), widgetInfo.width, widgetInfo.height));
  };

  switch (widgetAction) {
    case 'WIDGET_CLICK': {
      if (!lunch || (clickAction !== LUNCH_NEXT && clickAction !== LUNCH_PREV)) return;
      const { payload, page } = await stepLunchPage(clickAction === LUNCH_NEXT ? 1 : -1);
      renderWidget(renderLunch(payload, page, widgetInfo.width, widgetInfo.height));
      break;
    }
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
      await draw();
      await syncWidget((await getStoredWidgetWallet()) || null);
      await draw();
      break;
    case 'WIDGET_RESIZED':
      await draw();
      break;
    default:
      break;
  }
}
