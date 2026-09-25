# Mecky Chat — agent suite in the Expo app (design)

Date: 2026-09-25 · Status: APPROVED by Max (build now) · Owner: Max

## 1. Intent

The profile FAB becomes **Chat** and opens a full agent-chat environment inside the Röbel app:
onboarding, a family of customizable bots (Mecky first), rich chats (files, option cards, images,
voice, mentions, group chats), routines, an "Ultra" subscription and — later — a live view of a
cloud computer the agent works on. The long-term goal is **local, very cheap, very fast AI**: every
model call goes through named routes so the backend flips to self-hosted vLLM without an app release.

Decisions (Max, 2026-09-25): audience = Röbel users, Mecky family, German UI · models = gateway
routes now (hosted Anthropic), local vLLM later · billing = RevenueCat IAP **but not yet** —
Max tests the full UX via `eas update` first and says when to integrate · computer view = phase 5
on our own Hetzner microVMs.

**Visual spec: the 19 Grok-Bot reference screenshots Max supplied are the design, 1:1**
(layout, spacing, radii, colors, glass pill headers, soft wide shadows, black user bubbles, light
grey bot bubbles). Only copy changes (German). Fonts = the app's Inter family. Light mode exactly
as the references; dark mode derived from `useTheme()` tokens.

## 2. Hard constraints

- **OTA-only until billing**: no new native modules. Available: expo-blur, expo-image-picker,
  expo-audio, expo-clipboard, expo-haptics, expo-secure-store, expo-file-system, expo-crypto,
  react-native-webview, react-native-svg, reanimated 4, gesture-handler, @gorhom/bottom-sheet 5,
  react-native-markdown-display, react-native-sse, `expo/fetch` (streaming).
- No API key in the app. All model calls server-side.
- Worklet helpers need `'worklet'`; import runtime hooks (`useIsFocused`, `useFocusEffect`) from
  `expo-router`, never `@react-navigation/native`; Metro imports extensionless.
- StyleSheet + `useTheme()`, no NativeWind. Code/identifiers English, UI German.
- Never show wallet addresses.

## 3. Architecture

```
Expo app (app/chat/*, components/chat/*, lib/chat/*)
   │  HTTPS JSON + SSE (Bearer chat session token)
   ▼
apps/web  /api/chat/*  (Next.js route handlers, nodejs, maxDuration 300)
   │  src/lib/chat/*  = framework-agnostic runtime (loop, tools, routes, store)
   ├── model routes ── Anthropic today │ LLM_GATEWAY_URL (LiteLLM/vLLM) when set
   └── Supabase (service role) chat_* tables + storage bucket `chat-media`
```

Deviation from the in-chat design: the runtime was going to be a Fly container; Fly CLI is not
logged in on this machine, so the runtime is a **pure TS module mounted in Next.js routes**
(deploys with `git push`). It has no Next imports below the route layer, so lifting it into a
Hono container later is a copy, not a rewrite. Realtime is not used (the app has no Supabase auth
session → RLS can't scope rows); the app refetches on focus + on push.

### 3.1 Auth

1. App: `POST /api/chat/session` with a wallet signature over
   `roebel-chat-v1:session:<wallet>:<ts>:<sha256(sorted payload)>` (same grammar as
   `lib/signed-request`, own scope so it can't replay elsewhere). Verified with the existing
   EOA → ERC-1271 path (Gnosis).
2. Server returns `{ token, expiresAt }` — HS256 JWT (`jose`, secret `CHAT_SESSION_SECRET`,
   sub = lowercased wallet, 30 days).
3. App stores it in SecureStore (`chat_session_v1:<wallet>`), sends `Authorization: Bearer`.
   401 → re-sign once transparently.

### 3.2 Model routes (`src/lib/chat/models.ts`)

| route | today (Anthropic) | later (gateway alias) |
|---|---|---|
| `bot-fast` | `claude-haiku-4-5-20251001` | `bot-fast` |
| `bot-smart` | `claude-sonnet-5` | `bot-smart` |
| `vision` | `claude-sonnet-5` | `vision` |

If `LLM_GATEWAY_URL` + `LLM_GATEWAY_KEY` are set, every route resolves through
`@ai-sdk/openai-compatible` against the gateway with the route name as model id (LiteLLM aliases).
Web search (Anthropic server tool) is only offered when the route resolves to Anthropic.
STT: `POST /api/chat/transcribe` → OpenAI `gpt-4o-mini-transcribe` (route `stt`), later Whisper local.

### 3.3 Data model (migration `supabase/migrations/20260925_chat_suite.sql`)

All tables: RLS **enabled, no policies** (server-only via service role); `revoke all … from anon, authenticated`.

- `chat_bots` — id uuid pk, owner_wallet text null (null = preset), slug text unique null, name,
  description, instructions, avatar jsonb `{shape,color,eyes}`, model_route text default 'bot-smart',
  tools text[] default '{web_search,files,ask_options}', is_preset bool, sort int, created_at, updated_at.
- `chat_threads` — id, owner_wallet, title, topic text null (chip), kind 'direct'|'group',
  last_message_at, last_message_preview, last_read_at, archived bool, created_at.
- `chat_thread_bots` — thread_id, bot_id, pk(thread_id, bot_id).
- `chat_messages` — id, thread_id, role 'user'|'bot'|'system', bot_id null, parts jsonb,
  reply_to_id null, reactions jsonb default '{}', created_at. Index (thread_id, created_at).
- `chat_files` — id, thread_id, owner_wallet, name, ext, content text, size int, created_at, updated_at.
- `chat_routines` — id, owner_wallet, thread_id, bot_id, title, schedule jsonb
  `{kind:'weekly'|'daily', weekday?, hour, minute, tz:'Europe/Berlin'}`, prompt, enabled, next_run_at, last_run_at.
- `chat_runs` — id, owner_wallet, thread_id, bot_id, route, input_tokens, output_tokens,
  cost_micros bigint, status 'ok'|'error'|'quota', error text, created_at.
- `chat_entitlements` — wallet pk, tier 'free'|'plus'|'ultra', source text, expires_at.
- Storage bucket `chat-media` (private; signed URLs).
- Seed: the 4 preset bots (§4.2).

### 3.4 Message parts (shared contract — `apps/expo/lib/chat/types.ts` ≡ `apps/web/src/lib/chat/types.ts`)

```ts
type ChatPart =
  | { type: 'text'; text: string }                          // markdown allowed (links)
  | { type: 'options'; question: string; options: { key: string; label: string }[];
      selected?: string | null; dismissed?: boolean }
  | { type: 'file'; fileId: string; name: string; ext: string; size: number }
  | { type: 'image'; url: string; width?: number; height?: number }
  | { type: 'integration'; provider: 'google_calendar'; title: string; description: string;
      status: 'pending' | 'connected' }
  | { type: 'sources'; items: { title: string; url: string }[] };

interface BotAvatarSpec { shape: BotShape; color: string; eyes: BotEyes }
type BotShape = 'circle' | 'cloud' | 'drop' | 'hexagon' | 'squircle' | 'pill' | 'triangle' | 'egg' | 'blob';
type BotEyes = 'dots' | 'dashes' | 'wink' | 'happy';

interface ChatBot { id; name; description; instructions?; avatar: BotAvatarSpec; isPreset; modelRoute }
interface ChatThread { id; title; topic: string|null; kind: 'direct'|'group'; bots: ChatBot[];
  lastMessageAt; lastMessagePreview; unread: boolean }
interface ChatMessage { id; threadId; role: 'user'|'bot'|'system'; botId: string|null;
  parts: ChatPart[]; replyTo: { id: string; preview: string } | null;
  reactions: Record<string, number>; createdAt: string }
```

### 3.5 HTTP API (all JSON, Bearer auth except `/session`; errors `{ error: { code, message(de) } }`)

| method + path | body / query | returns |
|---|---|---|
| POST `/api/chat/session` | `{wallet, timestamp, signature}` | `{token, expiresAt}` |
| GET `/api/chat/bootstrap` | – | `{presets: ChatBot[], bots: ChatBot[], threads: ChatThread[], tier, quota:{used,limit}}` |
| POST `/api/chat/bots` | `{name, description?, instructions?, avatar}` | `{bot}` |
| PATCH `/api/chat/bots/:id` | partial | `{bot}` |
| POST `/api/chat/threads` | `{botIds: string[]}` | `{thread, messages}` (bot greets: 1–2 bot messages) |
| GET `/api/chat/threads/:id/messages` | `?before=<iso>&limit=50` | `{messages, hasMore}` (ascending) |
| POST `/api/chat/threads/:id/read` | – | `{ok}` |
| POST `/api/chat/threads/:id/messages` | `{text, imageUrls?, replyToId?, mentionBotIds?, optionAnswer?:{messageId, key}}` | **SSE stream** (below) |
| POST `/api/chat/messages/:id/reactions` | `{emoji}` | `{reactions}` |
| POST `/api/chat/messages/:id/dismiss-options` | – | `{message}` |
| GET `/api/chat/files/:id` | – | `{file:{id,name,ext,size,content}}` |
| POST `/api/chat/uploads` | multipart `file` (image ≤ 10 MB) | `{url, width, height}` |
| POST `/api/chat/transcribe` | multipart `audio` (m4a) | `{text}` |
| GET/POST/DELETE `/api/chat/routines` | – | routines CRUD |
| GET `/api/chat/cron/routines` | `Authorization: Bearer $CRON_SECRET` | runs due routines |

SSE events (`event:` / `data:` JSON), in order:
`user` `{message}` (persisted user msg) → per bot turn: `bot_start {botId, messageId}` →
`delta {messageId, text}`* → `part {messageId, part}`* (options/file/sources/integration) →
`bot_done {message}` → finally `done {thread}` · on failure `error {code, message}`.
A turn may produce several bot messages (the bot splits long answers into 1–3 bubbles with a
`---split---` convention handled server-side).

### 3.6 Agent loop (`src/lib/chat/runtime.ts`)

`streamText` (ai v6) with `stopWhen: stepCountIs(6)`; system prompt = bot instructions + house
rules (German, short, concrete; offer an `ask_options` card when a choice helps; put long
structured output into a file via `write_file` and summarise in 1–3 sentences). Tools:
`ask_options({question, options[2–5]})`, `write_file({name, content})` / `update_file`,
`web_search` (Anthropic server tool → `sources` part), `create_routine` (phase 3),
`mention` routing: in group threads or with `mentionBotIds`, each addressed bot answers in turn.
Context window: last 30 messages + file names. Usage recorded to `chat_runs`; quota checked
before the run (free: 150k tokens/day, plus 1.5M, ultra 6M) → `error {code:'quota'}` → app shows paywall.

## 4. Expo app

### 4.1 Entry
`app/profile.tsx`: the FAB becomes **Chat** (chat-bubble icon, shown to every signed-in user) →
`router.push('/chat')`. The QR-scan FAB moves into the profile's header floating actions (kept for
NFT holders). Kill switch: `app_settings.chat_suite_enabled` (default 'true' for testing; FAB hidden when 'false').

### 4.2 Screens (reference screenshot # in brackets)
- `app/chat/index.tsx` — gate: no session → **Welcome** [1] (floating blob mascots drifting,
  "Mecky", "Dein Team aus Agenten, die immer für dich da sind.", black "Los geht's" pill);
  no bots/threads → **Onboarding** [2,3] ("Lerne deinen ersten Bot kennen", pager with 4 presets +
  "Eigenen Bot erstellen" slide with name input, 5 dots, black "Chat starten" / grey-disabled
  "Erstellen", "Eigenen erstellen" text link, ⋯ menu top right); else **Chat list** [5,6]
  (initials avatar top-left → back to profile, search + "+" glass circles, rows: avatar 48,
  name, topic chip, time, preview, online dot for bots with active routines, stacked avatars for groups).
- `app/chat/[threadId].tsx` — **Chat** [4,7,8,9,10,11,12,13,14,16]: glass header (back circle,
  pill with avatar + name → bot sheet, monitor circle → computer), centered "Heute 16:29"
  timestamp, bot bubbles (#F2F2F2-ish, radius 22), user bubbles black/white text right-aligned,
  reply-quote line (↪ + preview, grey), options card (lettered A–E rows; answered = single row
  with green check; dismissed = faded + "verworfen"), file card (M↓ badge, name + grey ext, size),
  sources/links blue underlined, integration card (icon, title, description, black "Autorisieren"),
  typing indicator = bot avatar bubble with animated eyes, "NEU" divider (blue), scroll-to-bottom
  circle, composer ("+" circle, pill input "Frag <Bot>", mic → recording pill red "■ 0:10",
  send = black circle ↑ when text), "+" menu [11] (Bild anhängen / Foto aufnehmen / Datei wählen),
  image preview in composer [12], "@" → bot mention popover [10].
- Long-press message → **action sheet** [15]: emoji row (👍 👎 ❤️ 😂 🎉 😮 +), Antworten,
  Thread starten, Als ungelesen markieren, Kopieren.
- File tap → **file sheet** [17]: ✕, filename, share; markdown rendered with tables.
- `app/chat/computer/[threadId].tsx` — **Computer** [18] (black, header back / bot / keyboard / ⋯,
  WebView noVNC when a VM URL exists; until phase 5 an empty state "Computer startet bald").
- `app/chat/ultra.tsx` — **Paywall** [19] 1:1 ("Mecky läuft mit Ultra", 3 checks, price
  "29,99 €/Monat", "Ultra abonnieren", "Käufe wiederherstellen", legal footnote, AGB/Datenschutz).
  Until RevenueCat: CTA shows "Bald verfügbar" toast. Opened on quota error and from ⋯ menus.
- Bot sheet (tap header pill): avatar, name, description, edit (name, shape, color, instructions), routines list.

### 4.3 Components (`components/chat/`)
`BotAvatar` (parametric SVG: shape × color × eyes, size) · `BotAvatarStack` · `GlassCircleButton` ·
`GlassPillHeader` · `ChatListRow` · `TopicChip` · `MessageBubble` · `MessageParts` (renders each
part) · `OptionsCard` · `FileCard` · `IntegrationCard` · `SourcesLinks` · `ReplyQuote` ·
`TypingIndicator` · `NewDivider` · `DayStamp` · `ScrollToBottomButton` · `Composer` (+ attach
menu, image preview, recording state, mention popover) · `MessageActionSheet` · `FileSheet` ·
`FloatingMascots` · `PagerDots` · `BlackPillButton`.

### 4.4 Data layer (`lib/chat/`)
`api.ts` (fetch wrappers, base via `getApiBaseUrl()`), `session.ts` (sign + SecureStore),
`stream.ts` (SSE over `expo/fetch` streaming body → typed events), `store.ts` (small zustand-free
context `ChatProvider` + `useChatThreads`, `useThread(threadId)` with optimistic user message,
streaming bot message, error retry), `types.ts`.

## 5. Phases

1. **Foundation + chat core (this build)** — migration, runtime, routes, session auth, presets,
   all screens except real computer; tools ask_options / write_file / web_search; uploads; STT;
   reactions; paywall UI (inert). Exit: Max tests via `eas update` on preview.
2. **Routines + proactive** — `create_routine` tool, Vercel cron every 5 min, push via existing
   notification hub, online dot, "Wöchentliche Essensplanung"-style chip.
3. **Integrations** — Google Calendar via MCP (OAuth in `expo-web-browser`), integration card
   connected state; device calendar fallback via expo-calendar.
4. **Ultra** — RevenueCat (needs EAS build), `chat_entitlements` via webhook, quota tiers live.
   **Only when Max says so.**
5. **Computer** — Firecracker/Kasm microVMs on own Hetzner (NOT a CPX42), noVNC in WebView,
   browser-use tool, sleep-on-idle.
6. **Local flip** — `LLM_GATEWAY_URL` → LiteLLM → vLLM on GEX44 (Proof 0 Task 0); per-bot routes; cost dashboard.

## 6. Env (Vercel, apps/web)
`CHAT_SESSION_SECRET` (new, required) · `ANTHROPIC_API_KEY` (exists) · `OPENAI_API_KEY` (STT) ·
`CRON_SECRET` (phase 2) · optional `LLM_GATEWAY_URL`, `LLM_GATEWAY_KEY`.

## 7. Testing
Web: `node:test` via `tsx` for pure modules (session message grammar, JWT, quota math, schedule
next-run, SSE encoder, parts reducer). Expo: pure-module tests for SSE parser + thread reducer;
visual checks against the references on the emulator before any OTA.
