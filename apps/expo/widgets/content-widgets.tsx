/**
 * Android "Mittagstisch" and "Diese Woche" home-screen widgets
 * (react-native-android-widget). Same layouts as the iOS widgets in targets/widget:
 *   - Mittagstisch: one page per restaurant, ‹ › step through them (clickAction
 *     LUNCH_PREV / LUNCH_NEXT, handled in widgets/task-handler.tsx), dish photo tiles.
 *   - Diese Woche: date block + title + time · place per row.
 */
// The widget library calls these components as plain functions; the React Compiler's
// memo hook would make every render throw "Invalid Hook Call" (blank widget).
'use no memo';

import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import {
  WIDGET_EVENTS_URL,
  WIDGET_LUNCH_URL,
  type EventsPayload,
  type LunchPayload,
  type WidgetEvent,
  type WidgetLunchDish,
} from '@/lib/widget-content';

export const LUNCH_WIDGET_NAME = 'Mittagstisch';
export const EVENTS_WIDGET_NAME = 'EventsThisWeek';
export const LUNCH_PREV = 'LUNCH_PREV';
export const LUNCH_NEXT = 'LUNCH_NEXT';

const PALETTE = {
  light: { bg: '#ffffff', text: '#000000', sub: '#6B7280', tile: '#F2F3F5', accent: '#00498B', accentBg: '#E6EEF6' },
  dark: { bg: '#18191B', text: '#e8eaed', sub: '#9AA0A6', tile: '#2A2C2F', accent: '#8AB4F8', accentBg: '#22324A' },
} as const;
type Palette = (typeof PALETTE)[keyof typeof PALETTE];

const PADDING = 12;
const HEADER_H = 28;

function Card({ pal, uri, children }: { pal: Palette; uri?: string; children: React.ReactNode }) {
  return (
    <FlexWidget
      {...(uri ? { clickAction: 'OPEN_URI', clickActionData: { uri } } : {})}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: 24,
        padding: PADDING,
        flexDirection: 'column',
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Empty({ pal, text, uri }: { pal: Palette; text: string; uri: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <TextWidget text={text} style={{ fontSize: 13, color: pal.sub, fontWeight: '600' }} />
    </FlexWidget>
  );
}

// ── Mittagstisch ──────────────────────────────────────────────────────────

function Arrow({ label, action, pal }: { label: string; action: string; pal: Palette }) {
  return (
    <FlexWidget
      clickAction={action}
      style={{ width: 28, height: HEADER_H, justifyContent: 'center', alignItems: 'center' }}
    >
      <TextWidget text={label} style={{ fontSize: 20, color: pal.accent, fontWeight: '700' }} />
    </FlexWidget>
  );
}

function DishTile({ dish, width, height, pal }: { dish: WidgetLunchDish; width: number; height: number; pal: Palette }) {
  const photoH = Math.max(40, height - 36);
  const meta = [dish.day, dish.price].filter(Boolean).join(' · ');
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: dish.url }}
      style={{ width, height, flexDirection: 'column', paddingLeft: 3, paddingRight: 3 }}
    >
      {dish.image ? (
        <ImageWidget
          image={`data:image/jpeg;base64,${dish.image}`}
          imageWidth={width - 6}
          imageHeight={photoH}
          radius={12}
          resizeMode="cover"
        />
      ) : (
        <FlexWidget style={{ width: width - 6, height: photoH, borderRadius: 12, backgroundColor: pal.tile }} />
      )}
      <TextWidget
        text={dish.name}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, color: pal.text, fontWeight: '600', marginTop: 4, width: width - 6 }}
      />
      {meta ? (
        <TextWidget text={meta} maxLines={1} truncate="END" style={{ fontSize: 11, color: pal.sub, width: width - 6 }} />
      ) : null}
    </FlexWidget>
  );
}

export function LunchWidget({
  payload,
  page,
  width,
  height,
  dark,
}: {
  payload: LunchPayload | null;
  page: number;
  width: number;
  height: number;
  dark: boolean;
}) {
  const pal = dark ? PALETTE.dark : PALETTE.light;
  const restaurants = payload?.restaurants ?? [];
  if (restaurants.length === 0) return <Empty pal={pal} text="Heute kein Mittagstisch" uri={WIDGET_LUNCH_URL} />;

  const idx = page >= 0 && page < restaurants.length ? page : 0;
  const r = restaurants[idx];
  const multi = restaurants.length > 1;

  const cols = width < 220 ? 1 : 2;
  const rows = height > 300 ? 2 : 1;
  const innerW = width - PADDING * 2;
  const bodyH = height - PADDING * 2 - HEADER_H - 4;
  const tileW = Math.floor(innerW / cols);
  const tileH = Math.floor(bodyH / rows);
  const shown = r.dishes.slice(0, cols * rows);

  const rowsOut: React.ReactNode[] = [];
  for (let i = 0; i < shown.length; i += cols) {
    rowsOut.push(
      <FlexWidget key={i} style={{ flexDirection: 'row', width: 'match_parent' }}>
        {shown.slice(i, i + cols).map((d) => (
          <DishTile key={d.id} dish={d} width={tileW} height={tileH} pal={pal} />
        ))}
      </FlexWidget>,
    );
  }

  return (
    <Card pal={pal}>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: HEADER_H, alignItems: 'center', marginBottom: 4 }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LUNCH_URL }}
          style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}
        >
          <TextWidget
            text={r.name}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 14, color: pal.text, fontWeight: '700' }}
          />
        </FlexWidget>
        {multi ? <Arrow label="‹" action={LUNCH_PREV} pal={pal} /> : null}
        {multi ? (
          <TextWidget text={`${idx + 1}/${restaurants.length}`} style={{ fontSize: 11, color: pal.sub }} />
        ) : null}
        {multi ? <Arrow label="›" action={LUNCH_NEXT} pal={pal} /> : null}
      </FlexWidget>
      {rowsOut}
    </Card>
  );
}

export function renderLunch(payload: LunchPayload | null, page: number, width: number, height: number) {
  return {
    light: <LunchWidget payload={payload} page={page} width={width} height={height} dark={false} />,
    dark: <LunchWidget payload={payload} page={page} width={width} height={height} dark />,
  };
}

// ── Diese Woche ───────────────────────────────────────────────────────────

const EVENT_ROW_H = 48;

function EventRow({ event, width, pal }: { event: WidgetEvent; width: number; pal: Palette }) {
  const meta = [event.time, event.location].filter(Boolean).join(' · ');
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: event.url }}
      style={{ flexDirection: 'row', width: 'match_parent', height: EVENT_ROW_H, alignItems: 'center' }}
    >
      <FlexWidget
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: pal.accentBg,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
        }}
      >
        <TextWidget text={event.weekday} style={{ fontSize: 10, color: pal.accent, fontWeight: '600' }} />
        <TextWidget text={event.day} style={{ fontSize: 16, color: pal.accent, fontWeight: '700' }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', marginLeft: 10, width: width - 50 }}>
        <TextWidget
          text={event.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, color: pal.text, fontWeight: '600', width: width - 50 }}
        />
        {meta ? (
          <TextWidget text={meta} maxLines={1} truncate="END" style={{ fontSize: 11, color: pal.sub, width: width - 50 }} />
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}

export function EventsWidget({
  payload,
  width,
  height,
  dark,
}: {
  payload: EventsPayload | null;
  width: number;
  height: number;
  dark: boolean;
}) {
  const pal = dark ? PALETTE.dark : PALETTE.light;
  const events = payload?.events ?? [];
  if (events.length === 0) return <Empty pal={pal} text="Diese Woche keine Events" uri={WIDGET_EVENTS_URL} />;

  const innerW = width - PADDING * 2;
  const rows = Math.max(1, Math.floor((height - PADDING * 2 - HEADER_H) / EVENT_ROW_H));
  return (
    <Card pal={pal}>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: WIDGET_EVENTS_URL }}
        style={{ width: 'match_parent', height: HEADER_H, justifyContent: 'center' }}
      >
        <TextWidget text="Diese Woche in Röbel" style={{ fontSize: 14, color: pal.text, fontWeight: '700' }} />
      </FlexWidget>
      {events.slice(0, rows).map((e) => (
        <EventRow key={e.id} event={e} width={innerW} pal={pal} />
      ))}
    </Card>
  );
}

export function renderEvents(payload: EventsPayload | null, width: number, height: number) {
  return {
    light: <EventsWidget payload={payload} width={width} height={height} dark={false} />,
    dark: <EventsWidget payload={payload} width={width} height={height} dark />,
  };
}
