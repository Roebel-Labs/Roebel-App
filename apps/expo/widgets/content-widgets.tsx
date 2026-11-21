/**
 * Android "Mittagstisch" and "Events" home-screen widgets (react-native-android-widget).
 * Same layouts as the iOS widgets in targets/widget; the size logic lives in
 * lib/widget-layout.ts (unit-tested, mirrored in Swift):
 *   - Events: 4×1 one row · 2×2 photo of the next event · 3×2/4×2 header + scrolling
 *     list · 3×3/4×4 header + hero card + scrolling list.
 *   - Mittagstisch: one page per restaurant, ‹ › step through them (clickAction
 *     LUNCH_PREV / LUNCH_NEXT, handled in widgets/task-handler.tsx); 4×1 one dish row,
 *     2×2 one photo, larger sizes a photo grid.
 */
// The widget library calls these components as plain functions; the React Compiler's
// memo hook would make every render throw "Invalid Hook Call" (blank widget).
'use no memo';

import React from 'react';
import { FlexWidget, ImageWidget, ListWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import {
  WIDGET_EVENTS_URL,
  WIDGET_LUNCH_URL,
  WIDGET_PLACE,
  type EventsPayload,
  type LunchPayload,
  type WidgetEvent,
  type WidgetLunchDish,
} from '@/lib/widget-content';
import {
  containBox,
  coverBox,
  EVENT_DATE_TILE,
  EVENT_ROW_GAP,
  EVENT_ROW_H,
  EVENTS_HEADER_GAP,
  EVENTS_HEADER_H,
  EVENTS_PADDING,
  eventDateLine,
  eventMetaLine,
  eventsHeroHeight,
  eventsLayoutKind,
  lunchLayout,
  showsAsFlyer,
} from '@/lib/widget-layout';

export const LUNCH_WIDGET_NAME = 'Mittagstisch';
export const EVENTS_WIDGET_NAME = 'EventsThisWeek';
export const LUNCH_PREV = 'LUNCH_PREV';
export const LUNCH_NEXT = 'LUNCH_NEXT';

const APP_BADGE = require('@/assets/widgets/app-badge.png');

type Hex = `#${string}`;
type Palette = {
  bg: Hex;
  text: Hex;
  sub: Hex;
  tile: Hex;
  border: Hex;
  red: Hex;
  accent: Hex;
  /** Round ‹ › buttons of the Mittagstisch pager. */
  button: Hex;
};

/** App tokens (constants/theme.ts): background, textPrimary/Secondary, border, error. */
const PALETTE: { light: Palette; dark: Palette } = {
  light: { bg: '#FFFFFF', text: '#000000', sub: '#6B7280', tile: '#F2F3F5', border: '#E5E7EB', red: '#DC2626', accent: '#00498B', button: '#EEEFF1' },
  dark: { bg: '#18191B', text: '#E8EAED', sub: '#9AA0A6', tile: '#2A2C2F', border: '#3C4043', red: '#F87171', accent: '#8AB4F8', button: '#2F3236' },
};

/** Mona Sans is embedded by expo-font (android assets/fonts), so the widget can use it. */
const FONT = { regular: 'MonaSans-Regular', medium: 'MonaSans-Medium', semi: 'MonaSans-SemiBold' } as const;

const RADIUS = 22;

function Card({
  pal,
  uri,
  padding,
  children,
}: {
  pal: Palette;
  uri?: string;
  padding: number;
  children: React.ReactNode;
}) {
  return (
    <FlexWidget
      {...(uri ? { clickAction: 'OPEN_URI', clickActionData: { uri } } : {})}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS,
        padding,
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
        borderRadius: RADIUS,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
      }}
    >
      <TextWidget
        text={text}
        style={{ fontSize: 13, color: pal.sub, fontFamily: FONT.medium, fontWeight: '500', textAlign: 'center' }}
      />
    </FlexWidget>
  );
}

function AppBadge({ size = 18 }: { size?: number }) {
  return <ImageWidget image={APP_BADGE} imageWidth={size} imageHeight={size} radius={Math.round(size * 0.24)} />;
}

const jpeg = (b64: string) => `data:image/jpeg;base64,${b64}` as const;

/**
 * A photo filling `width × height` without stretching. The library scales every bitmap
 * to exactly imageWidth × imageHeight (its resizeMode does nothing), so the image is
 * drawn at its cover size inside a clipping box and centred with negative margins.
 * Without a known aspect (payload of an older app) it falls back to the plain image.
 */
function CoverPhoto({ b64, aspect, width, height, radius = 0 }: { b64: string; aspect?: number; width: number; height: number; radius?: number }) {
  if (!aspect) {
    return <ImageWidget image={jpeg(b64)} imageWidth={width} imageHeight={height} radius={radius} />;
  }
  const box = coverBox(aspect, width, height);
  return (
    <FlexWidget
      style={{ width, height, flexDirection: 'row', overflow: 'hidden', ...(radius ? { borderRadius: radius } : {}) }}
    >
      <ImageWidget
        image={jpeg(b64)}
        imageWidth={box.width}
        imageHeight={box.height}
        style={{ width: box.width, height: box.height, marginLeft: box.offsetX, marginTop: box.offsetY }}
      />
    </FlexWidget>
  );
}

/**
 * The event photo for a `width × height` card: a flyer (portrait) is shown whole,
 * centred over a blurred, darkened copy of itself (as in the app); anything else fills
 * the card (centre crop). The parent clips the corners.
 */
function EventPhoto({ event, width, height }: { event: WidgetEvent & { image: string }; width: number; height: number }) {
  if (!showsAsFlyer(event.imageAspect, width, height)) {
    return <CoverPhoto b64={event.image} aspect={event.imageAspect} width={width} height={height} />;
  }
  const fit = containBox(event.imageAspect!, width, height);
  return (
    <OverlapWidget style={{ width, height }}>
      {event.imageBlur ? (
        <CoverPhoto b64={event.imageBlur} aspect={event.imageAspect} width={width} height={height} />
      ) : (
        <FlexWidget style={{ width, height, backgroundColor: '#1F2937' }} />
      )}
      <FlexWidget style={{ width, height, backgroundColor: '#00000038' }} />
      <FlexWidget style={{ width, height, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        <ImageWidget
          image={jpeg(event.image)}
          imageWidth={fit.width}
          imageHeight={fit.height}
          style={{ width: fit.width, height: fit.height }}
        />
      </FlexWidget>
    </OverlapWidget>
  );
}

// ── Mittagstisch ──────────────────────────────────────────────────────────

const LUNCH_PADDING = 12;
const LUNCH_HEADER_H = 32;
/** Round ‹ › button diameter, counter width, and the whole pager. */
const PAGER_BTN = 30;
const PAGER_COUNTER = 34;
const PAGER_W = PAGER_BTN * 2 + PAGER_COUNTER + 6;

const chevron = (dir: 'left' | 'right', color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${
    dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'
  }" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * ‹ 1/3 › — chevrons in the text color (black / white) on round light / dark grey
 * buttons, counter centred between them.
 */
function Pager({ idx, count, pal }: { idx: number; count: number; pal: Palette }) {
  const arrow = (dir: 'left' | 'right', action: string) => (
    <FlexWidget
      clickAction={action}
      style={{
        width: PAGER_BTN,
        height: PAGER_BTN,
        borderRadius: PAGER_BTN / 2,
        backgroundColor: pal.button,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <SvgWidget svg={chevron(dir, pal === PALETTE.dark ? '#FFFFFF' : '#000000')} style={{ width: 15, height: 15 }} />
    </FlexWidget>
  );
  return (
    <FlexWidget style={{ flexDirection: 'row', width: PAGER_W, height: LUNCH_HEADER_H, alignItems: 'center', justifyContent: 'flex-end' }}>
      {arrow('left', LUNCH_PREV)}
      <FlexWidget style={{ width: PAGER_COUNTER, height: LUNCH_HEADER_H, justifyContent: 'center', alignItems: 'center' }}>
        <TextWidget
          text={`${idx + 1}/${count}`}
          style={{ fontSize: 11, color: pal.sub, fontFamily: FONT.medium, fontWeight: '500' }}
        />
      </FlexWidget>
      {arrow('right', LUNCH_NEXT)}
    </FlexWidget>
  );
}

function DishPhoto({ dish, width, height, radius, pal }: { dish: WidgetLunchDish; width: number; height: number; radius: number; pal: Palette }) {
  return dish.image ? (
    <CoverPhoto b64={dish.image} aspect={dish.imageAspect} width={width} height={height} radius={radius} />
  ) : (
    <FlexWidget style={{ width, height, borderRadius: radius, backgroundColor: pal.tile }} />
  );
}

const dishMeta = (dish: WidgetLunchDish) => [dish.day, dish.price].filter(Boolean).join(' · ');

function DishTile({ dish, width, height, pal }: { dish: WidgetLunchDish; width: number; height: number; pal: Palette }) {
  const meta = dishMeta(dish);
  const inner = width - 6;
  const photoH = Math.max(40, height - (meta ? 38 : 22));
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: dish.url }}
      style={{ width, height, flexDirection: 'column', paddingLeft: 3, paddingRight: 3 }}
    >
      <DishPhoto dish={dish} width={inner} height={photoH} radius={12} pal={pal} />
      <TextWidget
        text={dish.name}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, color: pal.text, fontFamily: FONT.semi, fontWeight: '600', marginTop: 4, width: inner }}
      />
      {meta ? (
        <TextWidget
          text={meta}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, color: pal.sub, fontFamily: FONT.regular, width: inner }}
        />
      ) : null}
    </FlexWidget>
  );
}

function LunchHeader({ name, idx, count, width, pal }: { name: string; idx: number; count: number; width: number; pal: Palette }) {
  const multi = count > 1;
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: LUNCH_HEADER_H, alignItems: 'center', marginBottom: 8 }}>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: WIDGET_LUNCH_URL }}
        style={{ width: multi ? width - PAGER_W : width, height: LUNCH_HEADER_H, justifyContent: 'center' }}
      >
        <TextWidget
          text={name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 17, color: pal.text, fontFamily: FONT.semi, fontWeight: '600' }}
        />
      </FlexWidget>
      {multi ? <Pager idx={idx} count={count} pal={pal} /> : null}
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
  const count = restaurants.length;
  const layout = lunchLayout(width, height);
  const innerW = width - LUNCH_PADDING * 2;

  if (layout.kind === 'row') {
    const dish = r.dishes[0];
    const textW = innerW - 52 - (count > 1 ? PAGER_W : 0);
    const meta = [r.name, dish?.price].filter(Boolean).join(' · ');
    return (
      <Card pal={pal} padding={LUNCH_PADDING}>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 'match_parent', alignItems: 'center' }}>
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: dish?.url ?? WIDGET_LUNCH_URL }}
            style={{ flexDirection: 'row', alignItems: 'center', width: innerW - (count > 1 ? PAGER_W : 0) }}
          >
            {dish ? <DishPhoto dish={dish} width={44} height={44} radius={10} pal={pal} /> : null}
            <FlexWidget style={{ flexDirection: 'column', marginLeft: 8, width: textW }}>
              <TextWidget
                text={dish?.name ?? r.name}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 13, color: pal.text, fontFamily: FONT.semi, fontWeight: '600', width: textW }}
              />
              <TextWidget
                text={meta}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 11, color: pal.sub, fontFamily: FONT.regular, width: textW }}
              />
            </FlexWidget>
          </FlexWidget>
          {count > 1 ? <Pager idx={idx} count={count} pal={pal} /> : null}
        </FlexWidget>
      </Card>
    );
  }

  const bodyH = height - LUNCH_PADDING * 2 - LUNCH_HEADER_H - 8;
  const tileW = Math.floor(innerW / layout.cols);
  const tileH = Math.floor(bodyH / layout.rows);
  const shown = r.dishes.slice(0, layout.cols * layout.rows);
  const rowsOut: React.ReactNode[] = [];
  for (let i = 0; i < shown.length; i += layout.cols) {
    rowsOut.push(
      <FlexWidget key={i} style={{ flexDirection: 'row', width: 'match_parent' }}>
        {shown.slice(i, i + layout.cols).map((d) => (
          <DishTile key={d.id} dish={d} width={tileW} height={tileH} pal={pal} />
        ))}
      </FlexWidget>,
    );
  }

  return (
    <Card pal={pal} padding={LUNCH_PADDING}>
      <LunchHeader name={r.name} idx={idx} count={count} width={innerW} pal={pal} />
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

// ── Events ────────────────────────────────────────────────────────────────

/**
 * Calendar tile: bordered rounded square, the weekday on a grey band at the top
 * ("MI"), the day big below ("14"). `solid` = white tile on top of a photo.
 */
function DateTile({ event, size, pal, solid }: { event: WidgetEvent; size: number; pal: Palette; solid?: boolean }) {
  const radius = Math.round(size * 0.22);
  const inner = size - 2; // inside the 1 dp border
  const band = Math.round(size * 0.36);
  return (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: solid ? '#FFFFFF' : pal.border,
        backgroundColor: solid ? '#FFFFFF' : pal.bg,
        flexDirection: 'column',
      }}
    >
      <FlexWidget
        style={{
          width: inner,
          height: band,
          backgroundColor: solid ? '#F2F3F5' : pal.tile,
          borderTopLeftRadius: radius - 1,
          borderTopRightRadius: radius - 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TextWidget
          text={event.weekday.toUpperCase()}
          style={{
            fontSize: Math.round(size * 0.21),
            color: solid ? '#374151' : pal.sub,
            fontFamily: FONT.medium,
            fontWeight: '500',
            letterSpacing: 0.04,
          }}
        />
      </FlexWidget>
      <FlexWidget style={{ width: inner, height: inner - band, justifyContent: 'center', alignItems: 'center' }}>
        <TextWidget
          text={event.day}
          style={{
            fontSize: Math.round(size * 0.4),
            color: solid ? '#000000' : pal.text,
            fontFamily: FONT.semi,
            fontWeight: '600',
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

function EventsHeader({ place, width, pal }: { place: string; width: number; pal: Palette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_EVENTS_URL }}
      style={{ flexDirection: 'row', width: 'match_parent', height: EVENTS_HEADER_H, alignItems: 'center', marginBottom: EVENTS_HEADER_GAP }}
    >
      <TextWidget
        text={`Events in ${place}`}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 18, color: pal.text, fontFamily: FONT.medium, fontWeight: '500', width: width - 32 }}
      />
      <FlexWidget style={{ width: 32, alignItems: 'flex-end' }}>
        <AppBadge size={26} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** List item: date tile + title + "19:00 · Venue"; the gap below is part of the item. */
function EventRow({ event, width, pal }: { event: WidgetEvent; width: number; pal: Palette }) {
  const textW = width - EVENT_DATE_TILE - 14;
  const meta = eventMetaLine(event);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: event.url }}
      style={{ width: 'match_parent', height: EVENT_ROW_H + EVENT_ROW_GAP, paddingBottom: EVENT_ROW_GAP }}
    >
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: EVENT_ROW_H, alignItems: 'center' }}>
        <DateTile event={event} size={EVENT_DATE_TILE} pal={pal} />
        <FlexWidget style={{ flexDirection: 'column', marginLeft: 14, width: textW }}>
          <TextWidget
            text={event.title}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 16, color: pal.text, fontFamily: FONT.medium, fontWeight: '500', width: textW }}
          />
          {meta ? (
            <TextWidget
              text={meta}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 13, color: pal.sub, fontFamily: FONT.regular, width: textW, marginTop: 3 }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

/** Photo of the next event with a dark gradient, white title + "Venue · 19:00", date tile top right. */
function HeroCard({ event, width, height }: { event: WidgetEvent; width: number; height: number }) {
  const meta = [event.location, event.time ?? ''].filter(Boolean).join(' · ');
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: event.url }}
      style={{ width: 'match_parent', height: height + EVENT_ROW_GAP + 2, paddingBottom: EVENT_ROW_GAP + 2 }}
    >
      <OverlapWidget style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#00498B' }}>
        {event.image ? <EventPhoto event={{ ...event, image: event.image }} width={width} height={height} /> : null}
        <FlexWidget
          style={{
            width,
            height,
            backgroundGradient: { from: '#00000000', to: '#000000C0', orientation: 'TOP_BOTTOM' },
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 14,
          }}
        >
          <TextWidget
            text={event.title}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 18, color: '#FFFFFF', fontFamily: FONT.semi, fontWeight: '600', width: width - 28 }}
          />
          {meta ? (
            <TextWidget
              text={meta}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 13, color: '#E5E7EB', fontFamily: FONT.regular, width: width - 28, marginTop: 3 }}
            />
          ) : null}
        </FlexWidget>
        <FlexWidget style={{ width, flexDirection: 'row', justifyContent: 'flex-end', padding: 10 }}>
          <DateTile event={event} size={46} pal={PALETTE.light} solid />
        </FlexWidget>
      </OverlapWidget>
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
  if (events.length === 0) return <Empty pal={pal} text="Keine anstehenden Events" uri={WIDGET_EVENTS_URL} />;

  const kind = eventsLayoutKind(width, height);
  const first = events[0];

  if (kind === 'row') {
    const pad = 12;
    const textW = width - pad * 2 - 44 - 10 - 24;
    return (
      <Card pal={pal} uri={first.url} padding={pad}>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: 'match_parent', alignItems: 'center' }}>
          <DateTile event={first} size={44} pal={pal} />
          <FlexWidget style={{ flexDirection: 'column', marginLeft: 10, width: textW }}>
            <TextWidget
              text={eventDateLine(first)}
              maxLines={1}
              style={{ fontSize: 11, color: pal.red, fontFamily: FONT.medium, fontWeight: '500', width: textW }}
            />
            <TextWidget
              text={first.title}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 14, color: pal.text, fontFamily: FONT.semi, fontWeight: '600', width: textW }}
            />
            {first.location ? (
              <TextWidget
                text={first.location}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 11.5, color: pal.sub, fontFamily: FONT.regular, width: textW }}
              />
            ) : null}
          </FlexWidget>
          <FlexWidget style={{ width: 24, height: 'match_parent', alignItems: 'flex-end' }}>
            <AppBadge />
          </FlexWidget>
        </FlexWidget>
      </Card>
    );
  }

  if (kind === 'compact') {
    const pad = 10;
    const innerW = width - pad * 2;
    const photoH = Math.max(48, height - pad * 2 - 56);
    return (
      <Card pal={pal} uri={first.url} padding={pad}>
        <OverlapWidget style={{ width: innerW, height: photoH, borderRadius: 14, overflow: 'hidden' }}>
          {first.image ? (
            <EventPhoto event={{ ...first, image: first.image }} width={innerW} height={photoH} />
          ) : (
            <FlexWidget
              style={{ width: innerW, height: photoH, borderRadius: 14, backgroundColor: pal.tile, justifyContent: 'center', alignItems: 'center' }}
            >
              <DateTile event={first} size={48} pal={pal} />
            </FlexWidget>
          )}
          <FlexWidget style={{ width: innerW, flexDirection: 'row', justifyContent: 'flex-end', padding: 6 }}>
            <AppBadge size={20} />
          </FlexWidget>
        </OverlapWidget>
        <TextWidget
          text={eventDateLine(first)}
          maxLines={1}
          style={{ fontSize: 11, color: pal.red, fontFamily: FONT.medium, fontWeight: '500', marginTop: 6, width: innerW }}
        />
        <TextWidget
          text={first.title}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 13, color: pal.text, fontFamily: FONT.semi, fontWeight: '600', width: innerW }}
        />
      </Card>
    );
  }

  // list / hero: header, then one vertically scrolling list (the hero card is its first item).
  const innerW = width - EVENTS_PADDING * 2;
  const rows = kind === 'hero' ? events.slice(1) : events;
  return (
    <Card pal={pal} padding={EVENTS_PADDING}>
      <EventsHeader place={payload?.place || WIDGET_PLACE} width={innerW} pal={pal} />
      <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {kind === 'hero' ? <HeroCard key={`hero-${first.id}`} event={first} width={innerW} height={eventsHeroHeight(innerW)} /> : null}
        {rows.map((e) => (
          <EventRow key={e.id} event={e} width={innerW} pal={pal} />
        ))}
      </ListWidget>
    </Card>
  );
}

export function renderEvents(payload: EventsPayload | null, width: number, height: number) {
  return {
    light: <EventsWidget payload={payload} width={width} height={height} dark={false} />,
    dark: <EventsWidget payload={payload} width={width} height={height} dark />,
  };
}
