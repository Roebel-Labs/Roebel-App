/**
 * Headless handler for the Android "Mini Apps" widget. Runs without the app UI when the
 * launcher adds, resizes or periodically updates the widget (updatePeriodMillis = 30 min):
 * periodic updates re-sync for the last signed-in wallet so unread dots appear even while
 * the app is closed; everything else redraws from the stored payload.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getStoredWidgetWallet, readStoredPayload, syncWidget } from '@/lib/widget-sync';
import type { WidgetPayload } from '@/lib/widget-payload';
import { MiniAppsWidget } from './MiniAppsWidget';

export const WIDGET_NAME = 'MiniApps';

export function renderMiniApps(payload: WidgetPayload | null, width: number, height: number) {
  return {
    light: <MiniAppsWidget payload={payload} width={width} height={height} dark={false} />,
    dark: <MiniAppsWidget payload={payload} width={width} height={height} dark />,
  };
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;
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
