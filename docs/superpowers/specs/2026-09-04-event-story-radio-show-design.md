# Wochen-Radio: AI-hosted event stories (design)

Date: 2026-09-04
Status: approved in chat (decisions below), spec awaiting review
Scope: apps/web (generator, admin), Supabase (table, storage), apps/expo (playback)

## 1. Decisions already made

| Question | Decision |
|---|---|
| Host format | Single host. Mecky, the app mascot, moderates. |
| Music bed | Replace the current song (vocals) with one AI-generated instrumental bed from Eleven Music. The admin upload stays, so the bed can be swapped any time. |
| Voice | Design a dedicated Mecky voice with ElevenLabs Voice Design. |
| Account | Max has an ElevenLabs account and will provide the API key. |
| Trigger | Daily cron plus a manual "regenerate" button in the admin dashboard. |
| Segment length | About 20 seconds per event. |

## 2. Goal and non-goals

Goal: the event story row on the home feed plays like a small local radio show. Mecky introduces the week, then talks about each event while an instrumental bed plays underneath. Every event segment stands alone, so a person who taps the fourth event hears a complete, natural piece and never feels they missed the beginning. Music fades in when the viewer opens, ducks under speech, comes back between segments, and fades out on close.

Non-goals for this version: captions, two-host dialogue, per-user personalization, lock-screen or background playback, playback on the website, real-time regeneration when an event is approved (the daily run plus the manual button cover it), pronunciation dictionaries (add later only if local names are mangled).

## 3. ElevenLabs facts this design relies on

- Text to speech: `POST /v1/text-to-speech/{voice_id}/with-timestamps` with `eleven_multilingual_v2`. German is a supported language, 10,000 characters per request, 1 credit per character, and the response carries a character alignment from which the clip duration is read without decoding the MP3.
- Prosody hints across separately generated clips: `previous_text` and `next_text` in the request body. Only used as text context here, no request-id stitching, because segments are regenerated independently on different days.
- Voice Design: `POST /v1/text-to-voice/design` returns three previews with `generated_voice_id`, and `POST /v1/text-to-voice` turns one of them into a permanent voice.
- Music: `POST /v1/music` with `force_instrumental: true`, `model_id: music_v2`, `music_length_ms`. Paid plans only, about 900 credits per minute, commercial rights per the live Music terms table (must be read before the bed goes live).
- No mixing, ducking, or fading exists on the ElevenLabs side. Mixing happens in the app with two players.
- Concurrency is the limit, not requests per minute. Starter allows 3 parallel v2 requests, Creator 5. Beyond the cap the API queues briefly, then returns 429.
- EU residency and zero retention are Enterprise-only. Generated audio stays in the ElevenLabs history on self-serve plans.
- SDK: `@elevenlabs/elevenlabs-js` (Node 18+). The React Native package is for conversational agents only. The app never talks to ElevenLabs.

Estimated volume with ten events per week: roughly 4,500 characters of event segments once, 350 characters of intro per day, 200 characters of outro per week. About 8,000 credits per week including some regenerations, so around 32,000 per month. Starter (30,000) is tight, Creator (121,000) is comfortable and also covers the one-off music bed.

## 4. Architecture

```
Vercel cron (daily)  ──┐
Admin button (manual) ─┴─► apps/web  lib/event-radio/generate.ts
                              │  1. gather this week's approved events (same window as the app)
                              │  2. hash each event; skip events that already have a fresh segment
                              │  3. Claude writes German scripts (intro daily, event segments, outro weekly)
                              │  4. ElevenLabs TTS per script (with timestamps → duration)
                              │  5. upload MP3 to Supabase Storage bucket story-audio
                              │  6. insert rows into event_radio_segments, delete stale rows and files
                              ▼
                    Supabase: event_radio_segments (public read), app_settings keys
                              ▲
apps/expo HomeStoryBar ───────┘ fetches segments for the week's events
apps/expo StoryViewer   plays bed + narration with fades and ducking, drives slide timing
```

## 5. Data model

### Table `event_radio_segments` (new migration `supabase/migrations/20260904_event_radio_segments.sql`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| kind | text | CHECK in ('intro','event','outro') |
| event_id | uuid | FK events(id) ON DELETE CASCADE, set only for kind = 'event' |
| scope_key | text NOT NULL | event: the event id. intro: the date it was written for (YYYY-MM-DD). outro: the ISO week key (YYYY-Www) |
| week_key | text NOT NULL | ISO week in Europe/Berlin at generation time |
| valid_on | date | intro only, equals scope_key |
| content_hash | text NOT NULL | sha256 over the script inputs (see 6.2) |
| script | text NOT NULL | the spoken text |
| audio_url | text NOT NULL | public URL in the story-audio bucket |
| duration_ms | integer NOT NULL | from the TTS alignment |
| voice_id | text NOT NULL | |
| model_id | text NOT NULL | |
| request_id | text | ElevenLabs request id for support |
| created_at | timestamptz NOT NULL | default now() |

Unique index on (kind, scope_key, content_hash). Indexes on (event_id, created_at desc) and (kind, scope_key, created_at desc).

RLS: enabled. One policy, public SELECT. No insert or update policies, so only the service role writes.

"Latest wins": the reader picks the newest row per (kind, scope_key). Older rows for the same scope are deleted by the generator right after a newer one is inserted, together with their storage objects.

### `app_settings` keys

| Key | Meaning | Default when missing |
|---|---|---|
| event_radio_voice_id | ElevenLabs voice id of the Mecky voice | generator refuses to run |
| event_radio_enabled | 'false' switches narration off in the app without an app update | enabled |
| event_stories_audio_url | existing key, now holds the instrumental bed | no bed |

### Storage

Bucket `story-audio` (exists, public read). Path `radio/{week_key}/{kind}-{scope_key}-{hash8}.mp3`, content type audio/mpeg, cache control one year (files are content-addressed).

## 6. Generator (apps/web/src/lib/event-radio/)

Files: `window.ts` (Berlin date helpers), `hash.ts`, `gather.ts`, `prompts.ts`, `scripts.ts` (Claude calls), `tts.ts` (ElevenLabs), `storage.ts`, `select.ts` (latest per scope, shared logic with the app), `generate.ts` (orchestration), `types.ts`.

### 6.1 Window

Mirrors the app's `fetchThisWeekEvents` exactly: from today through the next Sunday (on a Sunday that means the following Sunday), approved events ordered by date, limit 10. Dates are computed in Europe/Berlin on the server. The app uses device local time, which is the same for people in Röbel.

Only public fields leave the database: id, title, description, date, time, end_time, location, organizer_name, category, ticket_price, website_url, is_cancelled. Never organizer_email or organizer_phone.

### 6.2 Hashes

- Event: sha256 of a JSON object with PROMPT_VERSION, voice_id, model_id and the public fields above. Any edit to the event, a voice change, or a prompt change produces a new hash and therefore a new segment.
- Intro: PROMPT_VERSION, voice_id, model_id, the date, and the list of (id, title, date) of the remaining events. The intro therefore regenerates daily and whenever the list changes.
- Outro: PROMPT_VERSION, voice_id, model_id, week_key. One per week.

### 6.3 Scripts (Claude)

Three functions, each a `generateObject` call with `anthropic("claude-opus-5")` (constant `SCRIPT_MODEL`; the current Claude API guidance defaults to Opus 5, and the volume here is a few thousand tokens per day) and a zod schema, following `lib/newsletter/generate.ts`:

- `writeIntro(events, todayBerlin)` → `{ script }`, 40 to 60 words.
- `writeEventSegments(events)` → `{ segments: [{ event_id, script }] }`, 45 to 70 words each. The call fails if any requested id is missing from the answer.
- `writeOutro()` → `{ script }`, 20 to 35 words.

Persona: Mecky as described in the existing Mecky prompt (small black bull with a golden crown, warm, northern, mostly Hochdeutsch with an occasional "Moin" or short Platt phrase, proud of Röbel and the Müritz).

Hard rules in the prompt:
- Spoken radio language. Short sentences. No lists, emojis, URLs, hashtags, or headings.
- Every event segment must stand alone: name the event in the first sentence, then weekday, time, and place. Never reference other segments or the show's order ("als Nächstes", "wie eben gesagt", "zum Schluss", "das war's").
- Times, dates, prices, and other numbers are written as spoken words ("um neunzehn Uhr", "am Samstag, dem sechsten September", "fünf Euro"). This avoids TTS mispronunciation.
- Only the provided data. Nothing invented. If the description is empty, stay with title, time, place, and one warm sentence. A cancelled event is announced as cancelled.
- No wallet addresses, no crypto jargon. Community currency, if ever mentioned, is "Röbel Münzen".
- No em-dashes or dash asides.
- Intro: greeting with the weekday, "hier ist Mecky mit dem Wochen-Radio", a teaser with the number of events and two or three highlights, an invitation to tap through. Must not depend on the order of the events.
- Outro: warm sign-off and a nudge to add your own event in the app.

### 6.4 Text to speech

`eleven_multilingual_v2`, `output_format=mp3_44100_128`, voice settings stability 0.5, similarity boost 0.75, style 0, speaker boost on, speed 1.0, `apply_text_normalization: 'auto'`, a fixed seed. `previous_text` is the intro script for every event segment, which gives the model the show's tone. Duration comes from the last `character_end_times_seconds` in the alignment; if the alignment is missing, estimate from file size at 128 kbps.

Concurrency: a small pool, default 2 parallel requests (`ELEVENLABS_CONCURRENCY` env override). SDK retries (max 2) handle 429 and 5xx. An event whose TTS still fails is skipped for this run and listed in the response; the next daily run retries it.

### 6.5 Orchestration (`generateEventRadio({ force?, dryRun? })`)

1. Read settings. Missing voice id or missing `ELEVENLABS_API_KEY` returns `{ skipped_reason }` with HTTP 200 (visible, not an outage).
2. Gather events. Zero events: only the outro is kept, no intro, response says so.
3. Compute hashes. Load existing rows. With `force` every scope is regenerated; otherwise only scopes without a matching (scope_key, content_hash) row.
4. Write scripts for the missing scopes. `dryRun` stops here and returns the scripts without spending TTS credits, so Max can read them first.
5. TTS, upload, insert per scope. Insert uses ON CONFLICT DO NOTHING on the unique index. After a successful insert, delete older rows for that scope and their files.
6. Expiry pass: delete event rows whose event date is more than 3 days in the past, intro rows older than 3 days, outro rows outside the current and previous week. Files first, then rows.
7. Return `{ generated: { intro, events, outro }, reused, skipped, errors }`.

Runtime budget: `maxDuration = 300`. A typical run is one to three Claude calls plus at most ten TTS calls, well under two minutes.

## 7. Triggers and admin

- Cron: `apps/web/src/app/api/cron/event-radio/route.ts`, schedule `0 4 * * *` in `vercel.json`, bearer `CRON_SECRET` like the other crons.
- Manual: `POST /api/event-radio/generate` with `requireAdmin()` (the `/api/newsletter/send` pattern), body `{ force?: boolean, dryRun?: boolean }`, `maxDuration = 300`.
- Read model for the panel: server action `getEventRadioOverview()` guarded with `isAuthenticated()`, returns the window's events joined with their newest segment, the intro for today, the outro for the week, both settings keys, and the newest `created_at`.
- Settings: server actions `setEventRadioVoiceId`, `setEventRadioEnabled` in `app/actions/app-settings.ts`.

Admin panel `EventRadioPanel.tsx`, rendered below the existing `EventStoryAudioPanel` on `/admin/dashboard/events`:
- Header "Wochen-Radio" with a switch "In der App aktiv" and the "Zuletzt generiert" time.
- Voice id input with save.
- Segment list: Intro (date), one row per event (title, weekday, status chip "Aktuell" / "Veraltet" / "Fehlt"), Outro. Each row with an `<audio controls>` preview and a collapsible script.
- Buttons "Skripte prüfen" (dryRun, shows the scripts in a dialog) and "Jetzt neu generieren" (force) with loading state and toasts.

## 8. One-off setup script

`apps/web/scripts/event-radio-setup.mjs`, plain Node and fetch, reads `ELEVENLABS_API_KEY` from the environment, `--out <dir>` required.

- `voice-preview --description "<text>" --text "<German sample>"`: calls Voice Design with `eleven_multilingual_ttv_v2`, writes the three preview MP3s, prints their `generated_voice_id`s. A default description and a default German sample ship in the script; Max edits them until a preview sounds like Mecky.
- `voice-create --generated-voice-id <id> --name Mecky`: creates the permanent voice, prints `voice_id`. Max pastes it into the admin panel.
- `bed --seconds 90 [--upload]`: Eleven Music, instrumental, `music_v2`, a fixed prompt for a warm, laid-back acoustic bed suitable for a small-town radio show, loopable, no vocals. Writes the MP3. With `--upload` (needs the service role key) it uploads to `story-audio/global/wochen-radio-bed.mp3` and sets `event_stories_audio_url`.

## 9. App playback (apps/expo)

### 9.1 Data

`lib/supabase-event-radio.ts`:

```ts
export type RadioSegment = { audioUrl: string; durationMs: number };
export type EventRadioBundle = {
  enabled: boolean;
  intro: RadioSegment | null;
  outro: RadioSegment | null;
  byEventId: Record<string, RadioSegment>;
};
export function fetchEventRadio(eventIds: string[]): Promise<EventRadioBundle>;
```

One select on `event_radio_segments` for the event ids, today's intro, and this week's outro, then `pickLatestPerScope` (pure, tested). Reads `event_radio_enabled`; 'false' returns an empty bundle. `HomeStoryBar` calls it after the events resolve, keeps it in the module cache and in `CachedStories.radio` (optional field, older caches still load).

`StoryViewer` types gain `StorySlideInput.narration?: RadioSegment`, `StoryGroup.introNarration?`, `StoryGroup.outroNarration?`. `audioTitle` becomes the disclosure text "Mecky · KI-Stimme · Musik: Eleven Music" when narration exists; `audioLinkUrl` becomes optional and the tooltip is only pressable when a link is set.

### 9.2 Playback model

Three players inside the viewer:

- Bed: the existing looping group player (or a slide's own `audioUrl` override, semantics unchanged).
- Override: unchanged.
- Narration: a new player fed by a clip queue.

Clip queue per slide, built by a pure function `buildNarrationQueue` in `components/feed/story-narration.ts`:
- Intro clip only when the viewer was opened at the first event slide, once per open.
- The slide's own segment.
- Outro clip after the last event slide's segment, once per open.
Tapping a middle event yields just that event's segment.

Timing on a narrated slide replaces the fixed timer: progress = (elapsed of finished clips + current time) / (queue total + TAIL_MS), the slide advances TAIL_MS after the last clip's `didJustFinish`. Slides without narration, video slides, and collections keep the current behaviour.

Volume envelope, driven by the existing `fadeVolume` helper:

| Moment | Bed | Duration |
|---|---|---|
| Viewer opens | 0 → 1.0 | 1200 ms |
| Narration clip starts | → 0.22 | 350 ms |
| Narration clip ends | → 1.0 | 700 ms |
| Close requested | → 0, then `onClose` | 400 ms |

Close is routed through one `requestClose()` used by the close button, the swipe-down gesture, and the end of the last group, so the fade-out always runs.

Long-press pauses bed and narration together. Mute mutes both and does not change timing. On open the viewer calls `setAudioModeAsync({ playsInSilentMode: true })` through the same defensive shim `FeedAudioPlayerCard` uses. On each slide change the next slide's narration is preloaded with expo-audio `preload()`, errors ignored.

### 9.3 Fallbacks

- expo-audio native module missing (old binary running a newer OTA): the existing defensive `require` marks audio unavailable, narration is ignored, the timer runs.
- Narration not loaded within 4 seconds, or a load error: this slide falls back to the timer and the bed comes back to full.
- Bundle disabled by the kill switch or empty: exactly today's behaviour.

## 10. Error handling summary

| Failure | Behaviour |
|---|---|
| Voice id or API key missing | Run returns skipped_reason, admin panel shows it |
| Claude call fails or returns incomplete segments | Run fails with 500, cron log shows it, nothing partial is written |
| TTS fails for one event after retries | That event is skipped and listed, others proceed, next run retries |
| Storage upload fails | Same as TTS failure for that scope |
| App: narration URL unreachable | Timer fallback for that slide |
| App: old binary | Timer, no narration |

## 11. Testing

Web, pure modules with the repo's `tsx --test` (no runner is configured in apps/web): window and week key (mirrors the app's formula, Sunday edge case), hashing (stable, ignores private fields, changes on voice or prompt version), latest-per-scope selection, prompt data block (no email or phone, all events present), queue and expiry decisions in `generate.ts` split into pure planning functions.

Web manual: `dryRun` from the panel shows scripts; a forced run produces audible segments in the panel.

Expo, jest-expo under `lib/__tests__` and `components/feed/__tests__`: `pickLatestPerScope`, `buildNarrationQueue` (open at first slide, open in the middle, last slide, intro only once), progress math.

Device checklist before any OTA (Max runs EAS himself, never from the agent): open at the first event (intro then segment, bed fades in), open at a middle event (no intro), long-press pause and resume, mute, swipe-down fade-out, close button fade-out, event without a segment (timer), kill switch off, old binary (timer). Tested on the emulator with a repacked channel APK first, as the OTA testing rule requires.

## 12. Privacy and compliance

- Only public event fields are sent to Claude and ElevenLabs.
- ElevenLabs processes in the US on self-serve plans and keeps generated audio in its history. Add it as a subprocessor in the DPIA documentation.
- The AI voice is disclosed in the viewer tooltip ("KI-Stimme"), as the AI Act Article 50 work requires.
- Music: read the live Eleven Music commercial-rights table for the chosen plan before the bed ships. In-app use has been allowed on paid self-serve plans; broadcast radio is not, and that is not what this is.

## 13. Rollout

1. Web slice: migration, generator, cron, admin panel, setup script. Gate: `ELEVENLABS_API_KEY` on Vercel (Max), migration applied through the Supabase MCP.
2. Setup: Max runs voice previews, creates the Mecky voice, generates and uploads the bed, saves the voice id, runs "Skripte prüfen" then "Jetzt neu generieren", listens in the panel.
3. Expo slice: viewer playback behind `event_radio_enabled`, emulator test with real segments, then Max ships the OTA. The kill switch stays in place for the first weeks.
