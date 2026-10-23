# Röbel Studio: livestream production + in-app viewing (DanceCup 2026)

**Date:** 2026-10-22 · **Status:** design, awaiting Max's approval · **Event:** DanceCup Röbel, **Sat 2026-11-07**
**Rehearsal:** full test stream on **Fri 2026-11-06** · **Fallback on the day:** OBS (not vMix)

This is the umbrella design. It is split into five sub-projects (§5) that each get their own plan, in the order of §6.
Marked *(Claude's call)* = a decision made in writing this, not agreed with Max; he can override it.

---

## 1. Intent and why

Max has livestreamed the yearly DanceCup in Röbel for several years (vMix; once OBS because Restream failed). The
stream draws a large audience. This year the organizer asked Max to run the stream himself. Max wants to:

1. Make the stream **really good**: rented Sony FX + capture card as main camera, iPhone as second angle,
   proper graphics.
2. Use it as **the Röbel App's biggest advert**: the best seat is in the app (player + chat + donations), the
   stream carries the app's logo, and social viewers see app activity (donations, chat) on air.
3. **Fund it** by selling ad slots to the organisations already in the Röbel App.
4. Build **his own streaming software** ("Restream-simple, vMix-capable"), prove it in production at the DanceCup,
   and possibly sell it later. Max knows from years of doing this what good software must feel like.

The pain it replaces: Google Sheet of groups → Figma design → Figma plugin → hundreds of exported lower-third
PNGs; heavyweight vMix/OBS UIs; Restream unreliability.

## 2. Goals, non-goals, anti-goals

**Goals (for 7 November)**
- A Mac desktop studio that runs the whole DanceCup stream, tested end-to-end on 6 November.
- Intuitive first: a calm preview/live switcher (Max picked layout **A**, §4.1) that a vMix user understands instantly.
- Graphics are **live, editable designs** bound to a table, not exported images.
- AI turns a sheet or photo of the schedule into the table and generates matching, editable graphics.
- One upload from the venue → Röbel App (native player) + YouTube + Facebook simultaneously.
- In-app: player, chat, donations, viewer count; donations and picked chat messages appear on the stream.
- A Röbel App user can **join the stream from their phone** (interview mode) and leave again.
- Organisations book and pay for ad slots in the app and the web org dashboard; bookings land in the studio.

**Non-goals (explicitly not for 7 November; see §8 "Later")**
- TikTok / vertical output (Max: "no TikTok").
- Custom animation *editor* (timeline/keyframes) and a full free-form template designer. Saved animation *presets*
  are in; a design editor beyond "edit text / colors / swap image / AI restyle" is not.
- AI inside the stream itself (live commentary, auto-directing, etc.).
- Emotes, subscriptions, channel points.
- Selling the software / multi-tenant SaaS.
- Windows support. Tauri.

**Anti-goals (would make it a failure even if it "works")**
- The stream drops, freezes or desyncs on 7 November with no quick way out. → OBS fallback must be ready,
  and the studio must be boring and stable before it is clever.
- The UI feels like OBS/vMix (panels everywhere). Max designs this; it must feel calm.
- Lower thirds still require exporting images.
- An app update logs users out (standing rule: updates never log users out).
- Raw wallet addresses visible anywhere (standing rule: show display names).
- Donations labelled "Spende" (use "Unterstützen"); ads not labelled "Werbung" on air.

**Must-have vs nice-to-have for 7 November (Max agreed)**
- **Must:** cameras + switching with transitions, lower thirds filled from the table, ad rotation / ad spots, donation
  alerts, streaming to app + YouTube + Facebook, in-app player + chat + Unterstützen, ad booking, phone join.
- **Nice-to-have, cut first if time runs out:** the Design canvas beyond simple text/color edits, AI import and AI
  generation (manual table + CSV import is the fallback), sound effects, chat highlights.
- **Go/no-go at the 11-06 rehearsal** *(Claude's call)*: the studio runs the show only if it streams ≥ 60 minutes
  continuously to all three destinations with no drop, freeze or audio desync, and lower thirds, ads and donation
  alerts work on air. Otherwise the show runs on OBS with the browser-source overlays (§4.6).

## 3. Constraints

- **Hard date.** Rehearsal 2026-11-06. iOS store build with the phone-join module submitted by **~2026-10-30**.
- **Hardware on the day:** MacBook (Apple Silicon assumed; Max to confirm model), Sony FX (FX3/FX30) via HDMI
  capture card (UVC), iPhone via Continuity Camera over **long USB cable** (active extension, test at rehearsal).
  Audio from camera mics and possibly a local USB microphone (§4.5).
- **Venue internet unknown.** Max must measure upload at the venue; ≥ 15–20 Mbit/s stable wanted. Studio must
  show stream health clearly.
- **Repo rules:** pnpm monorepo; code + comments English, UI German; Expo uses `StyleSheet` + `useTheme()`
  (no NativeWind); web uses Tailwind; Supabase via MCP; commit+push after work.
- **Max runs every `eas build` / `eas update` himself.** Expo changes without native deps ship OTA; the LiveKit
  module needs a store build.
- **Every paid AI call** is logged to `ai_usage_events` (KI-Kosten dashboard).
- **Stripe:** Connect is LIVE (platform approved 2026-09-27); direct charges only, platform fee via
  `application_fee_amount` (today 2 % + 0,10 €). Never Münzen/crypto through Stripe.
- No service-role / secret keys inside the desktop app binary.

## 4. The shape of it

```
 Sony FX ─HDMI─▶ capture card ─USB─┐
 iPhone ─USB (Continuity Camera)───┤
 USB mic / camera audio ───────────┤
 Phone guests (Röbel App, LiveKit) ┤
                                   ▼
                     ┌───────────────────────────┐
                     │  Röbel Studio (Electron)  │  Show · Design · Table
                     │  PixiJS compositor + mixer│
                     │  HW encode → ffmpeg → SRT │──▶ local recording (backup)
                     └─────────────┬─────────────┘
                                   │ one SRT upload
                                   ▼
                       Cloudflare Stream Live ──▶ live outputs: YouTube, Facebook
                                   │ HLS
                                   ▼
             Röbel App event page: player · chat · Unterstützen · viewer count
                                   │ Supabase Realtime (chat, donations, presence)
                                   └──────────────▶ back into the Studio (alerts, chat picks)
```

### 4.1 Studio UI: layout A (Max's choice)
Three tabs: **Show · Design · Table** (Max chose a separate Design mode).

**Show** (the switcher, simplified vMix):
- **Preview** monitor (green) left · transition buttons + **TAKE** middle · **Live** monitor (red) right.
- **Source row** below: cameras, media (ad videos, pause loop, images), scenes (split screen 2-up, picture-in-
  picture), phone guests. A pending phone join appears as a doorbell tile ("📱 Max möchte beitreten") with accept/decline.
- **Overlay row**: lower third, logo bug, clock, ad banner/ticker, donation alert, chat highlight. Each toggles
  in/out with its animation. Overlays can be armed onto Preview or fired directly onto Live.
- Picking a row in the table (or a "next" control) fills the lower third in Preview with that group.
- **Audio mixer** strip (§4.5) and a **stream health** bar (bitrate, dropped frames, upload, CPU, recording, on-air time).
- Big, clear "On Air / Off Air" state. Keyboard shortcuts for TAKE, cut, overlays.

**Design** (open canvas, Figma-like): all graphics as frames on a pannable board, variants side by side; click
text to retype; change colors/images; an AI prompt bar ("mehr Gala, Gold-Akzent, unser Navy behalten"). Designs
show live data from the table.

**Table**: the show's database. AI import from a Google Sheet (link or pasted CSV) or a photo/screenshot of a
schedule → rows (group name, category/age class, club/town, planned time, free extra columns). Editable like a
spreadsheet; a fix here updates every graphic instantly.

Visual direction: Max reviews and proposes designs from the first draft. Brand navy `#00498B`, Inter/Plus Jakarta Sans.

### 4.2 Transitions and animations
- Transition templates: Cut, Fade, Wipe, Slide (direction), Zoom; duration + easing adjustable.
- Overlay in/out templates: Fade, Slide (from edge), Scale, Wipe, Typewriter (text).
- **Custom = saved presets**: Max adjusts parameters (duration, easing, direction, delay, stagger) and saves
  them by name. A keyframe editor is "Later".

### 4.3 Design format *(Claude's call, central to everything)*
Graphics are stored as **data in our own JSON scene format**: frames containing text, rectangles, images/logos,
video, with position, style, animation presets, and **bindings** like `{{row.group}}`. The same document is
(a) drawn on the Design canvas and (b) rendered into the outgoing video by the compositor, so what Max sees is
exactly what airs. AI outputs this format (validated against a schema), never pixels. Fonts used in designs are
bundled with the app.

### 4.4 Live components
Clock (time of day), countdown (to a start time), "Als Nächstes" (next table row), donation alert (name optional
+ amount + message, queued, animated), chat highlight (operator clicks a chat message to put it on air), ad
banner/ticker (rotates booked logos, always labelled "Werbung"), sound effects board (applause, drum roll, air
horn … short clips, own channel).

### 4.5 Audio
Any macOS audio input is a channel (capture-card audio from the FX, iPhone, USB mic, phone guests, media files,
sound effects). Per channel: meter, fader, mute, **delay offset** (lip-sync), and optional "follows video" (only
audible when its source is live). Master meter and limiter on the output. Recommendation to Max (not a
requirement): ask the venue for a line feed from the mixing desk via a USB audio interface; camera mic mixed in
low for atmosphere.

### 4.6 Output and reliability
- 1920×1080 @ 30 fps default, 50 fps selectable *(Claude's call)*; H.264 via Mac hardware encoder; AAC audio;
  ~6 Mbit/s default, adjustable.
- Transport **SRT** to a Cloudflare Stream Live input *(Claude's call: SRT tolerates poor venue internet better
  than RTMP)*; RTMPS as a setting fallback.
- Local recording of the program output to disk at the same time.
- Show state (sources, designs, table, presets) autosaves; after a crash the app reopens exactly where it was.
- Must run 6+ hours without memory growth or frame drops on the target MacBook. The rehearsal is the acceptance test.
- OBS stays installed and configured with the same Cloudflare input as an emergency fallback (Max's call).
- **Overlays also run as a browser-source page** *(Claude's call)*: a URL that renders the same overlay layers
  (lower thirds, ads, clock, donation alerts) on a transparent background, driven by the same live state. In the
  OBS fallback, OBS loads this page as a browser source, so graphics, ads and alerts still air. Built in from day one,
  not added later.
- **Cloudflare is verified first** *(Claude's call)*: day one of the studio plan is a spike proving SRT input →
  Cloudflare Stream Live → HLS playback + live outputs to YouTube and Facebook on the existing account. If that fails,
  the distribution layer is redesigned before anything else is built. Single point of failure accepted, with a fallback:
  OBS can stream directly to YouTube with its own key if Cloudflare is down.

### 4.7 Tech stack *(Claude's proposal; Max asked, did not object)*
| Part | Choice |
|---|---|
| App | React + TypeScript, new `apps/studio` in this monorepo; runs in the browser for Design/Table prep, ships as **Electron** for the show machine |
| Why Electron, not Tauri | Tauri on macOS uses WebKit; Chromium's WebCodecs/WebGL/media capture are the proven path for live video. Same code could move to Tauri later |
| Capture | `getUserMedia` / `enumerateDevices` (capture cards, Continuity Camera, USB mics) |
| Compositor + canvas | PixiJS (GPU). One scene model drives Design canvas and program output |
| Audio | Web Audio graph |
| Encode/send | WebCodecs hardware H.264 (VideoToolbox) → bundled ffmpeg (stream copy) → SRT. Encoding path is the builder's call if a better one proves more stable |
| AI | Claude via a server route (never a key in the app), structured output = the design/table schema; logged to `ai_usage_events` |
| Distribution | Cloudflare Stream Live (existing Cloudflare Stream account, `CLOUDFLARE_*` secrets) with live outputs to YouTube + Facebook; recordings become the replay |
| Phone guests | LiveKit (LiveKit Cloud for 7 Nov *(Claude's call)*, self-host later) |
| Chat, presence, alerts | Supabase (tables + Realtime) |
| Payments | existing Stripe Connect setup (apps/web `/api/connect/*`, tickets pattern) |

Studio sign-in: the operator signs in as a Röbel account with an admin/org role for the event; the studio gets
short-lived, scoped credentials from the server. Exact mechanism is the builder's call within "no secrets in the
binary".

## 5. The five sub-projects

### 5.1 Ad booking (deadline ~2026-10-28)
- Per livestream event, Max defines **ad packages**: name, description, what it includes (e.g. logo in banner
  rotation, 15–30 s video spot between rounds, "präsentiert von" main partner), price, number of places, file
  requirements, booking deadline. *(Prices are Max's call; earlier suggestion ~50–100 / 150–250 / 400+ €.)*
- Organisations book in the **Röbel App** (extend the existing org Werbung screen `apps/expo/app/org/ads.tsx`) and in
  the **web org dashboard** (`apps/web/src/app/dashboard/ads`): pick package → upload logo/video → pay → status.
- Payment: Stripe Checkout as a **direct charge on the event's beneficiary connected account** with the platform fee
  (same pattern as tickets). Beneficiary = a per-event setting (§7, open).
- Max (and the organizer, if wanted) **approves** each booking's media; approved items appear in the studio's
  media/ad list automatically, tagged "Werbung".
- After the event the booking shows how often/long the slot aired (studio logs on-air events).
- Refund path if rejected or if the stream doesn't happen.

### 5.2 Phone join (store build by ~2026-10-30)
- Platforms: **iOS and Android** *(Claude's call)*; iOS is the must-have for 7 Nov. Users on an older binary simply
  don't see "Live beitreten".
- Expo: add LiveKit React Native SDK (native → store build; bump build numbers). Guard the import so **old
  binaries without the module never crash** (same pattern as `lib/stripe-native.ts`). Must not change auth
  storage/config (no logouts).
- On a live event page, permitted users see "Live beitreten". Who is permitted *(Claude's call)*: users the operator
  invited from the studio (or anyone, with the operator's accept as the gate). The phone shows its own camera preview,
  a clear "Du bist LIVE" state when the operator puts them on air, mic mute, camera flip, and "Verlassen".
- Studio: join request → doorbell tile → accept → guest becomes a normal source (video + audio channel); kick/end.
- Server issues LiveKit tokens (room per stream). Guest video ≥ 720p target.
- On-air consent: joining shows a short notice that video and voice will be broadcast publicly.
- **Send-only for 7 Nov (Max):** the phone sends picture + sound and hears nothing back (no return audio, no talkback).

### 5.3a Where the DanceCup graphics come from (Max)
Max designs this year's graphics himself (lower third, logo bug, ad banner, schedule card, pause screen, donation
alert …) and delivers them when done. The builder translates them into the design format (§4.3) as the studio's
starter templates, reading them straight from Figma via the Figma MCP where possible *(Claude's call)*. Until they
arrive, the studio uses simple placeholder templates; nothing waits on them except the final look.

### 5.3 Studio core (ready for internal tests ~2026-11-04)
Everything in §4.1 Show + §4.2 + §4.4 (without AI) + §4.5 + §4.6, plus Table (manual + CSV import) and the Design
canvas with editing. Receives donations, chat and ad bookings from Supabase.

### 5.4 Viewing in the Röbel App (~2026-11-04, OTA)
- Event page (`apps/expo/app/event/[id].tsx`, today a YouTube embed via `events.livestream_url`): native `expo-video`
  HLS player from Cloudflare (fullscreen, picture-in-picture, quality, live-edge/rewind if Cloudflare HLS allows),
  `LivestreamBanner` keeps working. YouTube URL support stays for other events.
- Live chat under the player (Supabase Realtime): signed-in users write, everyone reads; moderation for the
  operator (delete message, mute user, slow mode).
- **Unterstützen** button: amount presets + free amount + optional message + show-my-name toggle → Stripe Checkout
  (web route, like tickets) → on success the alert is queued for the studio.
- Viewer count (Supabase presence or Cloudflare's count, builder's call).
- After the stream: the Cloudflare recording becomes the replay on the event page.
- Web: the same player/chat on the event's web page is nice-to-have, not required (citizens use the Expo app).

### 5.5 AI designs (~2026-11-05)
- Table import from a sheet link/CSV or an image (photo/screenshot of a printed schedule) → proposed rows Max
  confirms.
- "Generate graphics": from the table + a style prompt or an uploaded draft/reference image → lower third,
  schedule card (16:9 overview), "Als Nächstes" card, sponsor slide, pause screen, all in the design format, all
  editable. "Restyle" prompts on existing designs.
- Model: latest Claude with vision; the builder picks speed/quality per call.

## 6. Order and dates

| # | Sub-project | Ready by | Why this slot |
|---|---|---|---|
| 1 | Ad booking | 10-28 | Organisations need a week to decide and pay |
| 2 | Phone join (app side + token server) | 10-30 | iOS store build must be submitted |
| 3 | Studio core | 11-04 | Leaves days for testing before the rehearsal |
| 4 | Viewing in the app | 11-04 | OTA, can land last |
| 5 | AI designs | 11-05 | Sits on top of the studio's design format |
| — | Rehearsal at the venue (all parts) | 11-06 | Acceptance test |

The design format (§4.3) and the Supabase schema for streams/chat/donations/ads are shared; define them first,
inside sub-project 1's plan, so the other plans build on them.

## 7. Open items (Max / organizer)

1. **Who receives donations and ad money**: **decided for now: Max's private Kleinunternehmen** (Stripe Connect
   onboarding already done). Still built as a per-event setting so the organizer's association can be the beneficiary
   later. Notes for Max: this is ordinary business income (counts toward the Kleinunternehmer limit; Nebentätigkeit
   check with the employer); never labelled "Spende". Max still talks to the organizer about the split.
2. Organizer OK for selling ad slots (existing sponsor exclusivity?).
3. **Music rights**: YouTube/Facebook Content ID may mute or block the stream; how was it handled in past years?
4. **Filming consent** for dancers, many of them minors: confirm the registration terms cover streaming.
5. YouTube and Facebook stream keys: whose channels?
6. Venue upload speed test; mixing-desk line feed possible?
7. MacBook model/RAM (performance budget).

## 8. Later (parked ideas, keep)

- Phones as cameras for anyone by **QR code** (no account), multiple roaming phone cameras.
- **Hand-held wireless microphones** for interviews (e.g. a receiver into the Mac's audio interface, or a mic plugged
  into the joining phone); return audio / talkback to phone guests.
- Vertical 9:16 output (TikTok/Reels/Shorts) with its own overlay layout; TikTok once a stream key is available.
- Keyframe animation editor; full free-form template designer; import from Figma.
- **AI inside the stream**: live captions/translation, automatic highlights/clips, AI suggestions for the next shot,
  auto lower third when a group is announced, Mecky as co-host / chat moderator.
- Emotes, subscriptions, channel points, polls/voting in chat (e.g. audience favourite).
- Stream Deck / MIDI control, multiple operators, remote producer in the browser.
- Browser-only "stream from the web" mode for small clubs (WHIP).
- Tauri build; Windows.
- Selling the software (multi-tenant, other towns/clubs, own brand).
- Ad performance reports for sponsors; reusable ad packages across events.
