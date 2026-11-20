/**
 * Android "Mini Apps" home-screen widget (react-native-android-widget).
 *
 * Same look as the Mini-Apps section on Erkunden and the iOS widget: rounded icon
 * (24 % radius, primary color behind it, first letter without icon), name below.
 * The recently opened apps come first; the store tile ("Mini-Apps entdecken") is always
 * the last item. Grid and icon size come from miniAppsGrid (lib/widget-layout.ts):
 * few items grow to fill the widget, many shrink into a grid.
 */
// The widget library calls these components as plain functions; the React Compiler's
// memo hook would make every render throw "Invalid Hook Call" (blank widget).
'use no memo';

import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import { WIDGET_STORE_URL, type WidgetApp, type WidgetPayload } from '@/lib/widget-payload';
import { MINI_PADDING, miniAppsGrid, storeTileLabel } from '@/lib/widget-layout';

const STORE_ICON = require('@/assets/illustration/mini-app-store.png');

const PALETTE = {
  light: { bg: '#ffffff', text: '#000000', tile: '#F7F7F7' },
  dark: { bg: '#18191B', text: '#e8eaed', tile: '#3c4043' },
} as const;
const DOT = '#FF3B30';
const FONT_MEDIUM = 'MonaSans-Medium';

type Hex = `#${string}`;
type Palette = (typeof PALETTE)[keyof typeof PALETTE];

function asHex(c: string | null, fallback: string): Hex {
  return (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback) as Hex;
}

function Label({ text, color, width, size }: { text: string; color: Hex; width: number; size: number }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{ fontSize: size, color, marginTop: 4, width, textAlign: 'center', fontFamily: FONT_MEDIUM, fontWeight: '500' }}
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
      style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
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
  const all = payload?.apps ?? [];
  const grid = miniAppsGrid(all.length, width, height);
  const { cols, tileW, rowH, icon, labels, labelSize } = grid;
  const dotPad = Math.round(Math.max(8, icon * 0.2) / 2);

  const tiles: React.ReactNode[] = all.slice(0, grid.apps).map((app) => (
    <Tile key={app.slug} uri={app.url} width={tileW} height={rowH}>
      <AppIcon app={app} size={icon} pal={pal} />
      {labels ? <Label text={app.name} color={pal.text} width={tileW - 4} size={labelSize} /> : null}
    </Tile>
  ));
  tiles.push(
    <Tile key="__store" uri={WIDGET_STORE_URL} width={tileW} height={rowH}>
      <FlexWidget style={{ marginTop: dotPad }}>
        <ImageWidget image={STORE_ICON} imageWidth={icon} imageHeight={icon} />
      </FlexWidget>
      {labels ? <Label text={storeTileLabel(grid.apps, tileW)} color={pal.text} width={tileW - 4} size={labelSize} /> : null}
    </Tile>,
  );

  const rowsOut: React.ReactNode[] = [];
  for (let r = 0; r * cols < tiles.length; r++) {
    rowsOut.push(
      <FlexWidget key={r} style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'center' }}>
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
        borderRadius: 22,
        padding: MINI_PADDING,
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {rowsOut}
    </FlexWidget>
  );
}
