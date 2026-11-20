/**
 * Android "Mini Apps" home-screen widget (react-native-android-widget).
 *
 * Same look as the Mini-Apps section on Erkunden and the iOS widget: rounded icon
 * (24 % radius, primary color behind it, first letter without icon), name below,
 * 4-column grid sized to the widget, last tile "Alle" opens the store.
 */
// The widget library calls these components as plain functions; the React Compiler's
// memo hook would make every render throw "Invalid Hook Call" (blank widget).
'use no memo';

import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import { WIDGET_SETTINGS_URL, WIDGET_STORE_URL, type WidgetApp, type WidgetPayload } from '@/lib/widget-payload';

const STORE_ICON = require('@/assets/illustration/mini-app-store.png');

const PALETTE = {
  light: { bg: '#ffffff', text: '#000000', tile: '#F7F7F7' },
  dark: { bg: '#18191B', text: '#e8eaed', tile: '#3c4043' },
} as const;
const DOT = '#FF3B30';
const PADDING = 12;
const LABEL_H = 18;

type Hex = `#${string}`;
type Palette = (typeof PALETTE)[keyof typeof PALETTE];

function asHex(c: string | null, fallback: string): Hex {
  return (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback) as Hex;
}

export function gridFor(width: number, height: number) {
  const cols = width < 200 ? 2 : 4;
  const rows = Math.max(1, Math.min(4, Math.floor((height - PADDING * 2) / 64)));
  const tileW = Math.floor((width - PADDING * 2) / cols);
  const rowH = Math.floor((height - PADDING * 2) / rows);
  const icon = Math.max(32, Math.min(56, tileW - 16, rowH - LABEL_H - 6));
  return { cols, rows, tileW, rowH, icon };
}

function Label({ text, color, width }: { text: string; color: Hex; width: number }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{ fontSize: 11, color, marginTop: 4, width, textAlign: 'center' }}
    />
  );
}

function AppIcon({ app, size, pal }: { app: WidgetApp; size: number; pal: Palette }) {
  const radius = Math.round(size * 0.24);
  const dot = Math.max(8, Math.round(size * 0.2));
  const box = size + Math.round(dot / 2);
  return (
    <OverlapWidget style={{ width: box, height: box }}>
      <FlexWidget
        style={{
          marginTop: Math.round(dot / 2),
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: asHex(app.color, pal.tile),
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {app.icon ? (
          <ImageWidget
            image={`data:image/png;base64,${app.icon}`}
            imageWidth={size}
            imageHeight={size}
            radius={radius}
            resizeMode="cover"
          />
        ) : (
          <TextWidget
            text={app.name.slice(0, 1).toUpperCase()}
            style={{ fontSize: Math.round(size * 0.4), color: '#ffffff', fontWeight: '700' }}
          />
        )}
      </FlexWidget>
      {app.unread ? (
        <FlexWidget
          style={{
            marginLeft: size - Math.round(dot / 2),
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: DOT,
            borderWidth: 2,
            borderColor: pal.bg,
          }}
        />
      ) : null}
    </OverlapWidget>
  );
}

function Tile({ uri, width, height, children }: { uri: string; width: number; height: number; children: React.ReactNode }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{ width, height, alignItems: 'center', justifyContent: 'flex-start' }}
    >
      {children}
    </FlexWidget>
  );
}

export function MiniAppsWidget({
  payload,
  width,
  height,
  dark,
}: {
  payload: WidgetPayload | null;
  width: number;
  height: number;
  dark: boolean;
}) {
  const pal = dark ? PALETTE.dark : PALETTE.light;
  const apps = payload?.apps ?? [];

  if (apps.length === 0) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: WIDGET_SETTINGS_URL }}
        style={{
          width: 'match_parent',
          height: 'match_parent',
          backgroundColor: pal.bg,
          borderRadius: 24,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ImageWidget image={STORE_ICON} imageWidth={40} imageHeight={40} />
        <TextWidget
          text="Mini Apps auswählen"
          style={{ fontSize: 13, color: pal.text, fontWeight: '600', marginTop: 8 }}
        />
      </FlexWidget>
    );
  }

  const { cols, rows, tileW, rowH, icon } = gridFor(width, height);
  const shown = apps.slice(0, cols * rows - 1);
  const tiles: React.ReactNode[] = shown.map((app) => (
    <Tile key={app.slug} uri={app.url} width={tileW} height={rowH}>
      <AppIcon app={app} size={icon} pal={pal} />
      <Label text={app.name} color={pal.text} width={tileW - 4} />
    </Tile>
  ));
  tiles.push(
    <Tile key="__store" uri={WIDGET_STORE_URL} width={tileW} height={rowH}>
      <FlexWidget style={{ marginTop: Math.round(Math.max(8, icon * 0.2) / 2) }}>
        <ImageWidget image={STORE_ICON} imageWidth={icon} imageHeight={icon} />
      </FlexWidget>
      <Label text="Alle" color={pal.text} width={tileW - 4} />
    </Tile>,
  );

  const rowsOut: React.ReactNode[] = [];
  for (let r = 0; r * cols < tiles.length; r++) {
    rowsOut.push(
      <FlexWidget key={r} style={{ flexDirection: 'row', width: 'match_parent' }}>
        {tiles.slice(r * cols, r * cols + cols)}
      </FlexWidget>,
    );
  }

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: 24,
        padding: PADDING,
        flexDirection: 'column',
      }}
    >
      {rowsOut}
    </FlexWidget>
  );
}
