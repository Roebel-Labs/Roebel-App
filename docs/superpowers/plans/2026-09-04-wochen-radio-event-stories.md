# Wochen-Radio Event Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home-feed event stories into a modular radio show: Mecky narrates one standalone ElevenLabs clip per event over an instrumental bed that fades and ducks in the Expo story viewer, generated daily on the web.

**Architecture:** A daily Vercel cron (plus an admin button) in apps/web gathers this week's approved events, has Claude write standalone German scripts, renders them with ElevenLabs, uploads MP3s to the public `story-audio` bucket and records rows in a new `event_radio_segments` table keyed by content hash. The Expo app reads the newest row per scope and plays narration on a third audio player inside `StoryViewer`, ducking the existing bed player and driving slide timing from playback.

**Tech Stack:** Next.js 15 route handlers and server actions, `ai` + `@ai-sdk/anthropic` (`generateObject`, zod), ElevenLabs REST via `fetch` (no SDK), Supabase JS admin client and Storage, node:test via `tsx --test` (web), Expo SDK 55/56 with `expo-audio` and `jest-expo` (app).

**Spec:** `docs/superpowers/specs/2026-09-04-event-story-radio-show-design.md`

## Global Constraints

- Code identifiers and comments in English, all UI copy in German (repo rule).
- No em-dashes in code comments, UI copy, prompts, or generated scripts.
- Never show wallet addresses; never say "CRC" or "Circles" in UI or prompts. Currency label is "Röbel Münzen".
- Expo styling: `StyleSheet.create()` + `useTheme()`, no NativeWind. Prefer Mona Sans font tokens from `constants/theme.ts`; existing `Inter-*` names are aliased.
- `expo-audio` is a native module: every use in the viewer goes through the defensive `require` shim so an OTA on an older binary does not crash.
- Never run `eas update`. Max ships OTAs himself. Emulator test with a repacked channel APK comes first.
- Web typecheck needs `NODE_OPTIONS=--max-old-space-size=8192`. Expo typecheck has 30 pre-existing errors under `app/`; only new errors in touched files count.
- Supabase migrations are applied through the Supabase MCP (`apply_migration`). If the MCP is not authenticated in the session, hand the SQL to Max instead of using the CLI.
- Claude model for scripts: `claude-opus-5` (constant `SCRIPT_MODEL`). ElevenLabs model: `eleven_multilingual_v2`, output `mp3_44100_128`.
- ElevenLabs request budget: at most 10 events per run, concurrency 2 by default (`ELEVENLABS_CONCURRENCY`), 2 retries on 429/5xx.
- Only public event fields leave the database: id, title, description, date, time, end_time, location, organizer_name, category, ticket_price, website_url, is_cancelled. Never organizer_email or organizer_phone.
- Commit after every task with `git add <exact files>`, conventional prefixes `feat(supabase)`, `feat(web)`, `feat(expo)`, `docs`, and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Push after each commit.
- Web pure-module tests run with `cd apps/web && pnpm exec tsx --test <file>`; they import with relative paths (no `@/` alias, no `server-only`). Expo tests run with `cd apps/expo && pnpm exec jest <file>`.

---

## File Structure

**Supabase**
- Create `supabase/migrations/20260904_event_radio_segments.sql`: table, indexes, RLS, settings seed.

**Web generator, `apps/web/src/lib/event-radio/`** (pure modules first, I/O last)
- `window.ts`: Berlin date helpers, week window mirroring the app, ISO week keys, German date words.
- `hash.ts`: `PublicEvent` picker, stable hashing for event, intro, outro scopes.
- `select.ts`: `pickLatestPerScope` (shared logic, duplicated in the app).
- `plan.ts`: decides which scopes need generation, which rows are stale, which rows expire.
- `prompts.ts`: Mecky host persona, tone, hard rules, prompt builders. The persona lives here only, so a Stadtmusikanten character can take over later by editing one constant plus the voice setting.
- `scripts.ts`: three Claude calls.
- `tts.ts`: ElevenLabs with-timestamps call, retry, duration from alignment.
- `concurrency.ts`: `mapWithConcurrency`.
- `storage.ts`: object paths, upload, delete.
- `gather.ts`: Supabase reads (events, existing rows, settings).
- `generate.ts`: orchestration `generateEventRadio`.
- `__tests__/*.test.ts`: node:test files for the pure modules.

**Web routes and admin**
- `apps/web/src/app/api/cron/event-radio/route.ts`, `apps/web/vercel.json` (cron entry).
- `apps/web/src/app/api/event-radio/generate/route.ts` (admin POST).
- `apps/web/src/app/actions/app-settings.ts` (two new keys), `apps/web/src/app/actions/event-radio.ts` (overview).
- `apps/web/src/app/admin/dashboard/events/_components/EventRadioPanel.tsx`, wired into `apps/web/src/app/admin/dashboard/events/page.tsx`.
- `apps/web/.env.example` (`ELEVENLABS_API_KEY`).
- `apps/web/scripts/event-radio-setup.mjs` (voice previews, voice create, music bed).

**Expo**
- `apps/expo/lib/event-radio-select.ts`: `pickLatestPerScope`, date keys, `assembleRadioBundle` (pure).
- `apps/expo/lib/supabase-event-radio.ts`: `fetchEventRadio`.
- `apps/expo/lib/supabase-app-settings.ts`: `fetchEventRadioEnabled`.
- `apps/expo/lib/story-cache.ts`: optional `radio` in the cached bundle.
- `apps/expo/components/feed/story-narration.ts`: constants, `buildNarrationQueue`, `narrationProgress` (pure).
- `apps/expo/components/feed/StoryViewer.tsx`: narration player, ducking, timing, `requestClose`.
- `apps/expo/components/feed/HomeStoryBar.tsx`: fetch and pass narration.
- Tests in `apps/expo/lib/__tests__/event-radio-select.test.ts` and `apps/expo/components/feed/__tests__/story-narration.test.ts`.

---

### Task 1: Migration for `event_radio_segments`

**Files:**
- Create: `supabase/migrations/20260904_event_radio_segments.sql`

**Interfaces:**
- Produces: table `event_radio_segments` (columns as below), settings keys `event_radio_voice_id`, `event_radio_enabled`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- MIGRATION: event_radio_segments (Wochen-Radio)
-- One row per generated narration clip: the daily intro, one clip per
-- event, the weekly outro. Rows are content-addressed (content_hash) so
-- the generator only re-renders what changed. Public read for the Expo
-- app; writes only through the service role (no insert/update policy).
-- ============================================================

CREATE TABLE IF NOT EXISTS event_radio_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('intro', 'event', 'outro')),
  event_id      UUID REFERENCES events(id) ON DELETE CASCADE,
  -- event: the event id. intro: the date it was written for (YYYY-MM-DD).
  -- outro: the ISO week key (YYYY-Www).
  scope_key     TEXT NOT NULL,
  week_key      TEXT NOT NULL,
  valid_on      DATE,
  content_hash  TEXT NOT NULL,
  script        TEXT NOT NULL,
  audio_url     TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  voice_id      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_radio_segments_event_kind CHECK (
    (kind = 'event' AND event_id IS NOT NULL) OR (kind <> 'event' AND event_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_radio_segments_scope_hash_key
  ON event_radio_segments (kind, scope_key, content_hash);
CREATE INDEX IF NOT EXISTS event_radio_segments_event_idx
  ON event_radio_segments (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_radio_segments_scope_idx
  ON event_radio_segments (kind, scope_key, created_at DESC);

ALTER TABLE event_radio_segments ENABLE ROW LEVEL SECURITY;

-- Public read: the Expo app fetches with the anon key.
CREATE POLICY "event_radio_segments_select_public" ON event_radio_segments
  FOR SELECT USING (true);
-- No insert/update/delete policies on purpose: only the service role writes.

-- Settings keys read by the generator and the app.
INSERT INTO app_settings (key, value)
VALUES ('event_radio_voice_id', NULL), ('event_radio_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply the migration through the Supabase MCP**

Use the Supabase MCP `apply_migration` tool with name `event_radio_segments` and the SQL above. First confirm `get_project_url` returns the Röbel project (`wwbeqhkslxdxhktqzqti`), because the MCP follows the working directory's `.mcp.json`. If the MCP is not authenticated, stop here, tell Max the SQL is ready in the file, and continue with the web tasks (they compile without the table).

- [ ] **Step 3: Verify**

Run through the MCP: `select column_name from information_schema.columns where table_name = 'event_radio_segments' order by ordinal_position;`
Expected: the 14 columns listed above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904_event_radio_segments.sql
git commit -m "feat(supabase): event_radio_segments table for Wochen-Radio narration clips

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 2: Date window helpers (`window.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/window.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/window.test.ts`

**Interfaces:**
- Produces: `berlinToday(now?: Date): string`, `weekWindow(todayKey: string): WeekWindow`, `isoWeekKey(dateKey: string): string`, `previousWeekKey(dateKey: string): string`, `addDays(dateKey: string, days: number): string`, `germanLongDate(dateKey: string): string`, `germanWeekday(dateKey: string): string`, type `WeekWindow = { start: string; end: string; weekKey: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/event-radio/__tests__/window.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  berlinToday,
  germanLongDate,
  germanWeekday,
  isoWeekKey,
  previousWeekKey,
  weekWindow,
} from "../window";

test("berlinToday uses the Berlin calendar date, not UTC", () => {
  // 23:30 UTC on Sep 4 is already Sep 5 in Berlin (UTC+2 in summer).
  assert.equal(berlinToday(new Date("2026-09-04T23:30:00Z")), "2026-09-05");
  assert.equal(berlinToday(new Date("2026-09-04T10:00:00Z")), "2026-09-04");
});

test("weekWindow mirrors the app: today through next Sunday", () => {
  // 2026-09-04 is a Friday.
  assert.deepEqual(weekWindow("2026-09-04"), {
    start: "2026-09-04",
    end: "2026-09-06",
    weekKey: "2026-W36",
  });
});

test("weekWindow on a Sunday reaches the following Sunday (app formula)", () => {
  assert.equal(weekWindow("2026-09-06").end, "2026-09-13");
});

test("isoWeekKey handles year boundaries", () => {
  assert.equal(isoWeekKey("2026-09-04"), "2026-W36");
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
});

test("previousWeekKey and addDays", () => {
  assert.equal(previousWeekKey("2026-09-04"), "2026-W35");
  assert.equal(addDays("2026-09-04", -3), "2026-09-01");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("German date words for prompts", () => {
  assert.equal(germanWeekday("2026-09-06"), "Sonntag");
  assert.equal(germanLongDate("2026-09-06"), "Sonntag, 6. September");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/window.test.ts`
Expected: FAIL, cannot find module `../window`.

- [ ] **Step 3: Implement `window.ts`**

```ts
// apps/web/src/lib/event-radio/window.ts
// Pure date helpers for the Wochen-Radio generator. No I/O, no Next imports,
// so they run under `tsx --test`.

const DAY_MS = 86_400_000;

export type WeekWindow = { start: string; end: string; weekKey: string };

/** Today's calendar date in Europe/Berlin as YYYY-MM-DD. */
export function berlinToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  return toDateKey(new Date(parseDateKey(dateKey).getTime() + days * DAY_MS));
}

/**
 * Mirrors apps/expo `fetchThisWeekEvents`: from today through the next
 * Sunday. On a Sunday the formula yields the following Sunday (8 days).
 */
export function weekWindow(todayKey: string): WeekWindow {
  const day = parseDateKey(todayKey).getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  return {
    start: todayKey,
    end: addDays(todayKey, daysUntilSunday),
    weekKey: isoWeekKey(todayKey),
  };
}

/** ISO-8601 week key, e.g. 2026-W36. */
export function isoWeekKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousWeekKey(dateKey: string): string {
  return isoWeekKey(addDays(dateKey, -7));
}

/** "Sonntag, 6. September", used as a spoken-date hint in prompts. */
export function germanLongDate(dateKey: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseDateKey(dateKey));
}

export function germanWeekday(dateKey: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long" }).format(
    parseDateKey(dateKey),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/window.test.ts`
Expected: all 6 tests pass. If `germanLongDate` yields "Sonntag, 6. September" with a different separator, Node's ICU differs; adjust the assertion to the actual output only if the words are correct.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/event-radio/window.ts apps/web/src/lib/event-radio/__tests__/window.test.ts
git commit -m "feat(web): event-radio date window helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 3: Public event picker and content hashes (`hash.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/hash.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/hash.test.ts`

**Interfaces:**
- Produces: `PROMPT_VERSION`, type `PublicEvent`, `toPublicEvent(row: Record<string, unknown>): PublicEvent`, type `HashContext = { voiceId: string; modelId: string }`, `eventContentHash(ev, ctx)`, `introContentHash(events, validOn, ctx)`, `outroContentHash(weekKey, ctx)`, `sha256Hex(s)`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/event-radio/__tests__/hash.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventContentHash,
  introContentHash,
  outroContentHash,
  toPublicEvent,
  type PublicEvent,
} from "../hash";

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Hafenfest",
  description: "Musik am Wasser",
  date: "2026-09-05",
  time: "14:00:00",
  end_time: null,
  location: "Hafen Röbel",
  organizer_name: "Stadt Röbel",
  organizer_email: "secret@example.org",
  organizer_phone: "0123",
  category: "Fest",
  ticket_price: 0,
  website_url: null,
  is_cancelled: false,
  status: "approved",
};
const ctx = { voiceId: "voice-a", modelId: "eleven_multilingual_v2" };

test("toPublicEvent drops private contact fields", () => {
  const ev = toPublicEvent(row);
  assert.equal(ev.title, "Hafenfest");
  assert.equal(ev.organizer_name, "Stadt Röbel");
  assert.equal("organizer_email" in ev, false);
  assert.equal("organizer_phone" in ev, false);
  assert.equal(ev.is_cancelled, false);
});

test("toPublicEvent accepts numeric ticket_price as string", () => {
  assert.equal(toPublicEvent({ ...row, ticket_price: "5.50" }).ticket_price, 5.5);
});

test("eventContentHash is stable and ignores key order", () => {
  const a = toPublicEvent(row);
  const b = toPublicEvent({ ...row, title: row.title }); // same content
  assert.equal(eventContentHash(a, ctx), eventContentHash(b, ctx));
  assert.match(eventContentHash(a, ctx), /^[0-9a-f]{64}$/);
});

test("eventContentHash changes with content, voice, or model", () => {
  const ev = toPublicEvent(row);
  const base = eventContentHash(ev, ctx);
  assert.notEqual(eventContentHash({ ...ev, title: "Hafenfest 2" }, ctx), base);
  assert.notEqual(eventContentHash(ev, { ...ctx, voiceId: "voice-b" }), base);
  assert.notEqual(eventContentHash(ev, { ...ctx, modelId: "eleven_v3" }), base);
});

test("introContentHash depends on the day and the remaining events", () => {
  const ev: PublicEvent = toPublicEvent(row);
  const h1 = introContentHash([ev], "2026-09-04", ctx);
  assert.notEqual(introContentHash([ev], "2026-09-05", ctx), h1);
  assert.notEqual(introContentHash([], "2026-09-04", ctx), h1);
  // Description edits do not change the intro (only id, title, date count).
  assert.equal(introContentHash([{ ...ev, description: "x" }], "2026-09-04", ctx), h1);
});

test("outroContentHash depends on the week key", () => {
  assert.notEqual(outroContentHash("2026-W36", ctx), outroContentHash("2026-W37", ctx));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/hash.test.ts`
Expected: FAIL, cannot find module `../hash`.

- [ ] **Step 3: Implement `hash.ts`**

```ts
// apps/web/src/lib/event-radio/hash.ts
// Content addressing for narration clips. Bump PROMPT_VERSION whenever the
// prompts in prompts.ts change in a way that should re-render every clip.
import { createHash } from "node:crypto";

export const PROMPT_VERSION = 1;

/** The only event fields that ever leave the database (spec section 6.1). */
export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  end_time: string | null;
  location: string | null;
  organizer_name: string | null;
  category: string | null;
  ticket_price: number | null;
  website_url: string | null;
  is_cancelled: boolean;
};

export type HashContext = { voiceId: string; modelId: string };

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function toPublicEvent(row: Record<string, unknown>): PublicEvent {
  return {
    id: String(row.id),
    title: str(row, "title") ?? "",
    description: str(row, "description"),
    date: str(row, "date") ?? "",
    time: str(row, "time"),
    end_time: str(row, "end_time"),
    location: str(row, "location"),
    organizer_name: str(row, "organizer_name"),
    category: str(row, "category"),
    ticket_price: num(row, "ticket_price"),
    website_url: str(row, "website_url"),
    is_cancelled: row.is_cancelled === true,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function eventContentHash(ev: PublicEvent, ctx: HashContext): string {
  return sha256Hex(stableStringify({ v: PROMPT_VERSION, ...ctx, ev }));
}

export function introContentHash(
  events: PublicEvent[],
  validOn: string,
  ctx: HashContext,
): string {
  return sha256Hex(
    stableStringify({
      v: PROMPT_VERSION,
      ...ctx,
      validOn,
      events: events.map((e) => ({ id: e.id, title: e.title, date: e.date })),
    }),
  );
}

export function outroContentHash(weekKey: string, ctx: HashContext): string {
  return sha256Hex(stableStringify({ v: PROMPT_VERSION, ...ctx, weekKey }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/hash.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/event-radio/hash.ts apps/web/src/lib/event-radio/__tests__/hash.test.ts
git commit -m "feat(web): event-radio public event picker and content hashes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 4: Latest-per-scope selection (`select.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/select.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/select.test.ts`

**Interfaces:**
- Produces: type `RadioKind = "intro" | "event" | "outro"`, type `ScopedRow = { kind: RadioKind; scope_key: string; created_at: string }`, `scopeId(kind, scopeKey): string`, `pickLatestPerScope<T extends ScopedRow>(rows: T[]): Map<string, T>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/event-radio/__tests__/select.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickLatestPerScope, scopeId } from "../select";

test("scopeId joins kind and scope key", () => {
  assert.equal(scopeId("event", "abc"), "event:abc");
});

test("pickLatestPerScope keeps the newest row per scope", () => {
  const rows = [
    { id: "old", kind: "event" as const, scope_key: "e1", created_at: "2026-09-01T05:00:00+00:00" },
    { id: "new", kind: "event" as const, scope_key: "e1", created_at: "2026-09-03T05:00:00+00:00" },
    { id: "intro", kind: "intro" as const, scope_key: "2026-09-04", created_at: "2026-09-04T04:00:00.123456+00:00" },
  ];
  const latest = pickLatestPerScope(rows);
  assert.equal(latest.size, 2);
  assert.equal(latest.get("event:e1")?.id, "new");
  assert.equal(latest.get("intro:2026-09-04")?.id, "intro");
});

test("pickLatestPerScope is order independent", () => {
  const a = { id: "a", kind: "outro" as const, scope_key: "2026-W36", created_at: "2026-09-02T00:00:00Z" };
  const b = { id: "b", kind: "outro" as const, scope_key: "2026-W36", created_at: "2026-09-01T00:00:00Z" };
  assert.equal(pickLatestPerScope([a, b]).get("outro:2026-W36")?.id, "a");
  assert.equal(pickLatestPerScope([b, a]).get("outro:2026-W36")?.id, "a");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/select.test.ts`
Expected: FAIL, cannot find module `../select`.

- [ ] **Step 3: Implement `select.ts`**

```ts
// apps/web/src/lib/event-radio/select.ts
// "Latest wins" per (kind, scope_key). The Expo app carries the same logic
// in apps/expo/lib/event-radio-select.ts; keep the two in sync.

export type RadioKind = "intro" | "event" | "outro";

export type ScopedRow = { kind: RadioKind; scope_key: string; created_at: string };

export function scopeId(kind: RadioKind, scopeKey: string): string {
  return `${kind}:${scopeKey}`;
}

export function pickLatestPerScope<T extends ScopedRow>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const key = scopeId(row.kind, row.scope_key);
    const current = out.get(key);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) {
      out.set(key, row);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/select.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/event-radio/select.ts apps/web/src/lib/event-radio/__tests__/select.test.ts
git commit -m "feat(web): event-radio latest-per-scope selection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 5: Generation planning (`plan.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/plan.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/plan.test.ts`

**Interfaces:**
- Consumes: `PublicEvent`, `HashContext`, hashes (Task 3); `pickLatestPerScope`, `scopeId`, `RadioKind` (Task 4); `addDays` (Task 2).
- Produces: type `ExistingRow = { id: string; kind: RadioKind; scope_key: string; content_hash: string; audio_url: string; script: string; duration_ms: number; created_at: string; event_date: string | null }`, type `ScopePlan = { kind: RadioKind; scopeKey: string; hash: string; needed: boolean; event?: PublicEvent }`, `planScopes(input): { intro: ScopePlan | null; outro: ScopePlan; events: ScopePlan[] }`, `staleRowsForScope(existing, kind, scopeKey, keepId): ExistingRow[]`, `planExpiry(input): ExistingRow[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/event-radio/__tests__/plan.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventContentHash, introContentHash, outroContentHash, type PublicEvent } from "../hash";
import { planExpiry, planScopes, staleRowsForScope, type ExistingRow } from "../plan";

const ctx = { voiceId: "v", modelId: "m" };
const ev = (id: string, date: string): PublicEvent => ({
  id, title: `Event ${id}`, description: null, date, time: null, end_time: null,
  location: null, organizer_name: null, category: null, ticket_price: null,
  website_url: null, is_cancelled: false,
});
const row = (p: Partial<ExistingRow> & Pick<ExistingRow, "id" | "kind" | "scope_key">): ExistingRow => ({
  content_hash: "x", audio_url: `https://x/${p.id}.mp3`, script: "s", duration_ms: 20000,
  created_at: "2026-09-01T00:00:00Z", event_date: null, ...p,
});

test("planScopes marks fresh scopes as needed and matching hashes as reused", () => {
  const events = [ev("a", "2026-09-05"), ev("b", "2026-09-06")];
  const existing = [
    row({ id: "ra", kind: "event", scope_key: "a", content_hash: eventContentHash(events[0], ctx) }),
    row({ id: "ro", kind: "outro", scope_key: "2026-W36", content_hash: outroContentHash("2026-W36", ctx) }),
  ];
  const plan = planScopes({ events, todayKey: "2026-09-04", weekKey: "2026-W36", existing, ctx, force: false });
  assert.equal(plan.intro?.needed, true);
  assert.equal(plan.intro?.scopeKey, "2026-09-04");
  assert.equal(plan.outro.needed, false);
  assert.deepEqual(plan.events.map((p) => [p.scopeKey, p.needed]), [["a", false], ["b", true]]);
  assert.equal(plan.events[1].event?.title, "Event b");
});

test("planScopes with force regenerates everything", () => {
  const events = [ev("a", "2026-09-05")];
  const existing = [row({ id: "ra", kind: "event", scope_key: "a", content_hash: eventContentHash(events[0], ctx) })];
  const plan = planScopes({ events, todayKey: "2026-09-04", weekKey: "2026-W36", existing, ctx, force: true });
  assert.equal(plan.events[0].needed, true);
});

test("planScopes without events has no intro but still an outro", () => {
  const plan = planScopes({ events: [], todayKey: "2026-09-04", weekKey: "2026-W36", existing: [], ctx, force: false });
  assert.equal(plan.intro, null);
  assert.equal(plan.outro.needed, true);
  assert.equal(plan.outro.hash, outroContentHash("2026-W36", ctx));
});

test("planScopes intro hash matches introContentHash", () => {
  const events = [ev("a", "2026-09-05")];
  const plan = planScopes({ events, todayKey: "2026-09-04", weekKey: "2026-W36", existing: [], ctx, force: false });
  assert.equal(plan.intro?.hash, introContentHash(events, "2026-09-04", ctx));
});

test("staleRowsForScope returns other rows of the same scope", () => {
  const existing = [
    row({ id: "keep", kind: "event", scope_key: "a" }),
    row({ id: "old1", kind: "event", scope_key: "a" }),
    row({ id: "other", kind: "event", scope_key: "b" }),
  ];
  assert.deepEqual(staleRowsForScope(existing, "event", "a", "keep").map((r) => r.id), ["old1"]);
});

test("planExpiry removes old intros, foreign outros, and past events", () => {
  const existing = [
    row({ id: "i-old", kind: "intro", scope_key: "2026-08-30" }),
    row({ id: "i-new", kind: "intro", scope_key: "2026-09-03" }),
    row({ id: "o-old", kind: "outro", scope_key: "2026-W34" }),
    row({ id: "o-prev", kind: "outro", scope_key: "2026-W35" }),
    row({ id: "o-cur", kind: "outro", scope_key: "2026-W36" }),
    row({ id: "e-past", kind: "event", scope_key: "p", event_date: "2026-08-28" }),
    row({ id: "e-recent", kind: "event", scope_key: "r", event_date: "2026-09-02" }),
    row({ id: "e-nodate", kind: "event", scope_key: "n", event_date: null }),
  ];
  const expired = planExpiry({ existing, todayKey: "2026-09-04", weekKey: "2026-W36", previousWeekKey: "2026-W35" });
  assert.deepEqual(expired.map((r) => r.id).sort(), ["e-past", "i-old", "o-old"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/plan.test.ts`
Expected: FAIL, cannot find module `../plan`.

- [ ] **Step 3: Implement `plan.ts`**

```ts
// apps/web/src/lib/event-radio/plan.ts
// Pure planning: which scopes need a new clip, which rows became stale,
// which rows have expired. generate.ts executes these decisions.
import {
  eventContentHash,
  introContentHash,
  outroContentHash,
  type HashContext,
  type PublicEvent,
} from "./hash";
import { pickLatestPerScope, scopeId, type RadioKind } from "./select";
import { addDays } from "./window";

export type ExistingRow = {
  id: string;
  kind: RadioKind;
  scope_key: string;
  content_hash: string;
  audio_url: string;
  script: string;
  duration_ms: number;
  created_at: string;
  event_date: string | null;
};

export type ScopePlan = {
  kind: RadioKind;
  scopeKey: string;
  hash: string;
  needed: boolean;
  event?: PublicEvent;
};

export function planScopes(input: {
  events: PublicEvent[];
  todayKey: string;
  weekKey: string;
  existing: ExistingRow[];
  ctx: HashContext;
  force: boolean;
}): { intro: ScopePlan | null; outro: ScopePlan; events: ScopePlan[] } {
  const latest = pickLatestPerScope(input.existing);
  const needed = (kind: RadioKind, scopeKey: string, hash: string): boolean =>
    input.force || latest.get(scopeId(kind, scopeKey))?.content_hash !== hash;

  let intro: ScopePlan | null = null;
  if (input.events.length > 0) {
    const hash = introContentHash(input.events, input.todayKey, input.ctx);
    intro = { kind: "intro", scopeKey: input.todayKey, hash, needed: needed("intro", input.todayKey, hash) };
  }

  const outroHash = outroContentHash(input.weekKey, input.ctx);
  const outro: ScopePlan = {
    kind: "outro",
    scopeKey: input.weekKey,
    hash: outroHash,
    needed: needed("outro", input.weekKey, outroHash),
  };

  const events = input.events.map((event): ScopePlan => {
    const hash = eventContentHash(event, input.ctx);
    return { kind: "event", scopeKey: event.id, hash, needed: needed("event", event.id, hash), event };
  });

  return { intro, outro, events };
}

/** Rows of the same scope other than `keepId`; deleted after a new clip lands. */
export function staleRowsForScope(
  existing: ExistingRow[],
  kind: RadioKind,
  scopeKey: string,
  keepId: string,
): ExistingRow[] {
  return existing.filter((r) => r.kind === kind && r.scope_key === scopeKey && r.id !== keepId);
}

/** Spec section 6.5 step 6: intros older than 3 days, outros outside this and last week, events more than 3 days past. */
export function planExpiry(input: {
  existing: ExistingRow[];
  todayKey: string;
  weekKey: string;
  previousWeekKey: string;
}): ExistingRow[] {
  const cutoff = addDays(input.todayKey, -3);
  return input.existing.filter((row) => {
    if (row.kind === "intro") return row.scope_key < cutoff;
    if (row.kind === "outro") return row.scope_key !== input.weekKey && row.scope_key !== input.previousWeekKey;
    return typeof row.event_date === "string" && row.event_date < cutoff;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/plan.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/event-radio/plan.ts apps/web/src/lib/event-radio/__tests__/plan.test.ts
git commit -m "feat(web): event-radio generation planning

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 6: Prompts and Claude script writers (`prompts.ts`, `scripts.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/prompts.ts`, `apps/web/src/lib/event-radio/scripts.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/prompts.test.ts`

**Interfaces:**
- Consumes: `PublicEvent` (Task 3), `germanLongDate`, `germanWeekday` (Task 2).
- Produces: `HOST` (`{ name, showName, persona, disclosureLabel }`), `eventForPrompt(ev)`, `buildIntroPrompt(events, todayKey)`, `buildEventSegmentsPrompt(events)`, `buildOutroPrompt()`; `SCRIPT_MODEL`, `writeIntro(events, todayKey): Promise<string>`, `writeEventSegments(events): Promise<Map<string, string>>`, `writeOutro(): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/event-radio/__tests__/prompts.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicEvent } from "../hash";
import { buildEventSegmentsPrompt, buildIntroPrompt, buildOutroPrompt, eventForPrompt, HOST } from "../prompts";

const ev: PublicEvent = {
  id: "e1", title: "Hafenfest", description: "Musik am Wasser", date: "2026-09-05",
  time: "14:00:00", end_time: "18:30:00", location: "Hafen Röbel", organizer_name: "Stadt Röbel",
  category: "Fest", ticket_price: 5, website_url: "https://example.org", is_cancelled: false,
};

test("eventForPrompt exposes spoken-date hints and trims seconds", () => {
  const p = eventForPrompt(ev);
  assert.equal(p.event_id, "e1");
  assert.equal(p.weekday, "Samstag");
  assert.equal(p.date_spoken_hint, "Samstag, 5. September");
  assert.equal(p.time, "14:00");
  assert.equal(p.end_time, "18:30");
  assert.equal(p.ticket_price_eur, 5);
});

test("segment prompt carries persona, rules, and every event id", () => {
  const prompt = buildEventSegmentsPrompt([ev, { ...ev, id: "e2", title: "Lesung" }]);
  assert.ok(prompt.includes(HOST.persona));
  assert.ok(prompt.includes("HARTE REGELN"));
  assert.ok(prompt.includes('"event_id": "e1"'));
  assert.ok(prompt.includes('"event_id": "e2"'));
  assert.ok(prompt.includes("45 bis 70 Wörter"));
  assert.ok(prompt.includes("als Nächstes"));
});

test("intro prompt names the day and the count as context", () => {
  const prompt = buildIntroPrompt([ev], "2026-09-04");
  assert.ok(prompt.includes("Freitag, 4. September"));
  assert.ok(prompt.includes("Wochen-Radio"));
  assert.ok(prompt.includes("40 bis 60 Wörter"));
});

test("outro prompt asks for the sign-off and the create-event nudge", () => {
  const prompt = buildOutroPrompt();
  assert.ok(prompt.includes("Veranstaltung erstellen"));
  assert.ok(prompt.includes("20 bis 35 Wörter"));
});

test("prompts never contain private contact data or em-dashes", () => {
  const all = [buildEventSegmentsPrompt([ev]), buildIntroPrompt([ev], "2026-09-04"), buildOutroPrompt()].join("\n");
  assert.equal(all.includes("organizer_email"), false);
  assert.equal(all.includes("—"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/prompts.test.ts`
Expected: FAIL, cannot find module `../prompts`.

- [ ] **Step 3: Implement `prompts.ts`**

```ts
// apps/web/src/lib/event-radio/prompts.ts
// Everything the language model reads. The host persona lives ONLY here (plus
// the voice id in app_settings), so another Stadtmusikanten character can take
// over the microphone later by editing HOST and creating a new voice.
import type { PublicEvent } from "./hash";
import { germanLongDate, germanWeekday } from "./window";

export const HOST = {
  name: "Mecky",
  showName: "Wochen-Radio",
  persona:
    'Du bist "Mecky", das Maskottchen der Röbel/Müritz Community-App: ein kleiner schwarzer Bulle mit einer goldenen Krone, der in Röbel an der Müritz in Mecklenburg-Vorpommern lebt. Du moderierst das Wochen-Radio der App, eine kleine Radiosendung über die Veranstaltungen der Woche.',
  disclosureLabel: "Mecky · KI-Stimme",
} as const;

export const TONE = `TONALITÄT: Warm, herzlich, nordisch-locker. Hauptsächlich Hochdeutsch, ein "Moin" oder ein kurzer plattdeutscher Einwurf passt gelegentlich. Stolz auf Röbel und die Müritz. Kurze Sätze, gesprochene Radiosprache, ein Augenzwinkern. Kein Amtsdeutsch, kein Marketing-Sprech, keine Floskeln wie "Tauche ein" oder "Lass dich überraschen".`;

export const HARD_RULES = `HARTE REGELN:
- Nutze AUSSCHLIESSLICH die bereitgestellten Daten. Erfinde nichts dazu: keine Termine, keine Preise, keine Namen, keine Orte, keine Programmpunkte.
- Gesprochene Sprache für eine Radiosendung: keine Listen, keine Emojis, keine URLs, keine Hashtags, keine Überschriften, keine Klammern.
- Alle Zahlen, Uhrzeiten, Daten und Preise als gesprochene Wörter ausschreiben: "um neunzehn Uhr", "am Samstag, dem fünften September", "fünf Euro", "ab vierzehn Uhr dreißig". Niemals Ziffern.
- Keine Gedankenstriche und keine mit Bindestrich abgesetzten Einschübe; nutze Kommas oder mach zwei Sätze daraus.
- Niemals Wallet-Adressen, niemals "CRC", "Circles" oder Krypto-Jargon. Die Stadtwährung heißt, falls überhaupt erwähnt, "Röbel Münzen".
- Ist eine Veranstaltung abgesagt (is_cancelled = true), sag das klar und freundlich.
- Ist die Beschreibung leer, bleib bei Titel, Zeit und Ort und einem warmen Satz dazu.`;

export function eventForPrompt(ev: PublicEvent) {
  return {
    event_id: ev.id,
    title: ev.title,
    weekday: germanWeekday(ev.date),
    date_spoken_hint: germanLongDate(ev.date),
    time: ev.time ? ev.time.slice(0, 5) : null,
    end_time: ev.end_time ? ev.end_time.slice(0, 5) : null,
    location: ev.location,
    organizer: ev.organizer_name,
    category: ev.category,
    ticket_price_eur: ev.ticket_price,
    description: ev.description,
    is_cancelled: ev.is_cancelled,
  };
}

function header(): string {
  return `${HOST.persona}\n\n${TONE}\n\n${HARD_RULES}`;
}

export function buildEventSegmentsPrompt(events: PublicEvent[]): string {
  return `${header()}

JEDER BEITRAG STEHT FÜR SICH: Hörerinnen und Hörer steigen an beliebiger Stelle ein. Nenne die Veranstaltung im ersten Satz, dann Wochentag, Uhrzeit und Ort, danach ein bis zwei Sätze, was einen erwartet. Keine Bezüge auf andere Beiträge und keine Reihenfolge: nichts wie "als Nächstes", "weiter geht's", "wie eben gesagt", "zum Schluss", "das war's". Keine Begrüßung und keine Verabschiedung im Beitrag, dafür gibt es Intro und Outro.
LÄNGE: 45 bis 70 Wörter pro Beitrag, das sind etwa zwanzig Sekunden gesprochen.

VERANSTALTUNGEN (eine "script" je "event_id", alle event_ids unverändert zurückgeben):
${JSON.stringify(events.map(eventForPrompt), null, 2)}

Schreibe für jede Veranstaltung genau einen Beitrag.`;
}

export function buildIntroPrompt(events: PublicEvent[], todayKey: string): string {
  const teaser = events.map((e) => ({ title: e.title, weekday: germanWeekday(e.date) }));
  return `${header()}

Schreibe das Intro der Sendung für heute, ${germanLongDate(todayKey)}. Begrüßung mit dem Wochentag, dann "hier ist Mecky mit dem Wochen-Radio". Dann ein Teaser: wie viele Veranstaltungen noch anstehen (als Wort) und zwei bis drei Highlights mit Wochentag. Versprich keine Reihenfolge ("zuerst", "danach"), die Beiträge können in beliebiger Reihenfolge gehört werden. Zum Schluss eine kurze Einladung, sich durchzutippen.
LÄNGE: 40 bis 60 Wörter.

VERANSTALTUNGEN DIESER WOCHE (Anzahl: ${events.length}):
${JSON.stringify(teaser, null, 2)}`;
}

export function buildOutroPrompt(): string {
  return `${header()}

Schreibe das Outro der Sendung: eine kurze, warme Verabschiedung und der Hinweis, dass alle ihre eigenen Veranstaltungen in der App eintragen können, über "Veranstaltung erstellen". Kein Datum, keine konkreten Veranstaltungen, das Outro gilt die ganze Woche.
LÄNGE: 20 bis 35 Wörter.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/prompts.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Implement `scripts.ts`** (no unit test; exercised by the dry run in Task 9)

```ts
// apps/web/src/lib/event-radio/scripts.ts
// Claude writes the spoken scripts. Same stack as lib/newsletter/generate.ts.
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { PublicEvent } from "./hash";
import { buildEventSegmentsPrompt, buildIntroPrompt, buildOutroPrompt } from "./prompts";

export const SCRIPT_MODEL = "claude-opus-5";

const singleScriptSchema = z.object({
  script: z.string().describe("Der gesprochene Text, reine Prosa"),
});

const segmentsSchema = z.object({
  segments: z.array(
    z.object({
      event_id: z.string().describe("Unveränderte event_id aus den Daten"),
      script: z.string().describe("Der gesprochene Beitrag, 45 bis 70 Wörter"),
    }),
  ),
});

function clean(script: string): string {
  // Belt and braces: strip dash asides the prompt already forbids.
  return script.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
}

export async function writeIntro(events: PublicEvent[], todayKey: string): Promise<string> {
  const { object } = await generateObject({
    model: anthropic(SCRIPT_MODEL),
    schema: singleScriptSchema,
    prompt: buildIntroPrompt(events, todayKey),
    maxOutputTokens: 2000,
  });
  return clean(object.script);
}

export async function writeOutro(): Promise<string> {
  const { object } = await generateObject({
    model: anthropic(SCRIPT_MODEL),
    schema: singleScriptSchema,
    prompt: buildOutroPrompt(),
    maxOutputTokens: 1000,
  });
  return clean(object.script);
}

/** Map event id → script. Throws when any requested id is missing. */
export async function writeEventSegments(events: PublicEvent[]): Promise<Map<string, string>> {
  if (events.length === 0) return new Map();
  const { object } = await generateObject({
    model: anthropic(SCRIPT_MODEL),
    schema: segmentsSchema,
    prompt: buildEventSegmentsPrompt(events),
    maxOutputTokens: 6000,
  });
  const map = new Map<string, string>();
  for (const s of object.segments) map.set(s.event_id, clean(s.script));
  for (const ev of events) {
    if (!map.get(ev.id)) throw new Error(`Skript fehlt für Veranstaltung ${ev.id} (${ev.title})`);
  }
  return map;
}
```

- [ ] **Step 6: Typecheck the new modules**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "event-radio"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/event-radio/prompts.ts apps/web/src/lib/event-radio/scripts.ts apps/web/src/lib/event-radio/__tests__/prompts.test.ts
git commit -m "feat(web): event-radio Mecky prompts and Claude script writers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 7: ElevenLabs text to speech and concurrency helper (`tts.ts`, `concurrency.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/tts.ts`, `apps/web/src/lib/event-radio/concurrency.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/tts.test.ts`, `apps/web/src/lib/event-radio/__tests__/concurrency.test.ts`

**Interfaces:**
- Produces: `TTS_MODEL_ID`, `TTS_OUTPUT_FORMAT`, `VOICE_SETTINGS`, class `TtsError extends Error` with `status: number | null`, `durationFromAlignment(alignment, audioBytes): number`, `synthesizeSpeech(input: { text; voiceId; apiKey; previousText?; fetchImpl?; sleep? }): Promise<{ audio: Buffer; durationMs: number; requestId: string | null }>`; `mapWithConcurrency<T, R>(items, limit, fn): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/event-radio/__tests__/tts.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { durationFromAlignment, synthesizeSpeech, TtsError } from "../tts";

const okBody = {
  audio_base64: Buffer.from("fake-mp3-bytes").toString("base64"),
  alignment: { character_end_times_seconds: [0.1, 0.5, 1.234] },
};

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), {
      status: next.status,
      headers: { "request-id": `req-${calls.length}` },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const noSleep = async () => {};

test("durationFromAlignment uses the last character end time", () => {
  assert.equal(durationFromAlignment({ character_end_times_seconds: [0.2, 1.234] }, 10), 1234);
});

test("durationFromAlignment estimates from bytes at 128 kbps without alignment", () => {
  // 16000 bytes * 8 / 128000 = 1 s
  assert.equal(durationFromAlignment(undefined, 16000), 1000);
});

test("synthesizeSpeech posts to with-timestamps and returns audio, duration, request id", async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: okBody }]);
  const result = await synthesizeSpeech({ text: "Moin", voiceId: "v1", apiKey: "k", previousText: "Intro", fetchImpl: impl, sleep: noSleep });
  assert.equal(result.audio.toString(), "fake-mp3-bytes");
  assert.equal(result.durationMs, 1234);
  assert.equal(result.requestId, "req-1");
  assert.ok(calls[0].url.includes("/v1/text-to-speech/v1/with-timestamps?output_format=mp3_44100_128"));
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.previous_text, "Intro");
  assert.equal((calls[0].init.headers as Record<string, string>)["xi-api-key"], "k");
});

test("synthesizeSpeech retries 429 and 5xx, then succeeds", async () => {
  const { impl, calls } = fakeFetch([
    { status: 429, body: "slow down" },
    { status: 503, body: "busy" },
    { status: 200, body: okBody },
  ]);
  const result = await synthesizeSpeech({ text: "Moin", voiceId: "v1", apiKey: "k", fetchImpl: impl, sleep: noSleep });
  assert.equal(result.durationMs, 1234);
  assert.equal(calls.length, 3);
});

test("synthesizeSpeech does not retry a 400 and throws TtsError with status", async () => {
  const { impl, calls } = fakeFetch([{ status: 400, body: { detail: "bad voice" } }]);
  await assert.rejects(
    synthesizeSpeech({ text: "Moin", voiceId: "v1", apiKey: "k", fetchImpl: impl, sleep: noSleep }),
    (err: unknown) => err instanceof TtsError && err.status === 400,
  );
  assert.equal(calls.length, 1);
});
```

```ts
// apps/web/src/lib/event-radio/__tests__/concurrency.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "../concurrency";

test("mapWithConcurrency preserves order and captures errors", async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom");
    return n * 10;
  });
  assert.deepEqual(results[0], { ok: true, value: 10 });
  assert.equal(results[1].ok, false);
  assert.deepEqual(results[2], { ok: true, value: 30 });
});

test("mapWithConcurrency never runs more than `limit` at once", async () => {
  let running = 0;
  let peak = 0;
  await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
  });
  assert.equal(peak, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/tts.test.ts src/lib/event-radio/__tests__/concurrency.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `concurrency.ts`**

```ts
// apps/web/src/lib/event-radio/concurrency.ts
export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  const results: Settled<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
```

- [ ] **Step 4: Implement `tts.ts`**

```ts
// apps/web/src/lib/event-radio/tts.ts
// ElevenLabs text to speech through plain fetch (no SDK: keeps the Vercel
// bundle small, and the with-timestamps endpoint is a single JSON POST).
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps

export const TTS_MODEL_ID = "eleven_multilingual_v2";
export const TTS_OUTPUT_FORMAT = "mp3_44100_128";
export const TTS_SEED = 4242;
export const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
  speed: 1.0,
} as const;

const ELEVEN_BASE_URL = "https://api.elevenlabs.io";
const MAX_RETRIES = 2;

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "TtsError";
  }
}

export type TtsResult = { audio: Buffer; durationMs: number; requestId: string | null };

type Alignment = { character_end_times_seconds?: number[] } | null | undefined;

export function durationFromAlignment(alignment: Alignment, audioBytes: number): number {
  const ends = alignment?.character_end_times_seconds;
  if (ends && ends.length > 0) return Math.ceil(ends[ends.length - 1] * 1000);
  return Math.ceil(((audioBytes * 8) / 128_000) * 1000);
}

export async function synthesizeSpeech(input: {
  text: string;
  voiceId: string;
  apiKey: string;
  previousText?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<TtsResult> {
  const doFetch = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = `${ELEVEN_BASE_URL}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${TTS_OUTPUT_FORMAT}`;
  const body = JSON.stringify({
    text: input.text,
    model_id: TTS_MODEL_ID,
    previous_text: input.previousText,
    voice_settings: VOICE_SETTINGS,
    seed: TTS_SEED,
    apply_text_normalization: "auto",
  });

  let lastError: TtsError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "xi-api-key": input.apiKey, "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      lastError = new TtsError(`ElevenLabs nicht erreichbar: ${(err as Error).message}`, null);
      continue;
    }
    if (res.ok) {
      const json = (await res.json()) as { audio_base64?: string; alignment?: Alignment };
      if (!json.audio_base64) throw new TtsError("ElevenLabs: audio_base64 fehlt in der Antwort", res.status);
      const audio = Buffer.from(json.audio_base64, "base64");
      return {
        audio,
        durationMs: durationFromAlignment(json.alignment, audio.length),
        requestId: res.headers.get("request-id"),
      };
    }
    const text = await res.text().catch(() => "");
    lastError = new TtsError(`ElevenLabs ${res.status}: ${text.slice(0, 200)}`, res.status);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) break;
  }
  throw lastError ?? new TtsError("ElevenLabs: unbekannter Fehler", null);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/tts.test.ts src/lib/event-radio/__tests__/concurrency.test.ts`
Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/event-radio/tts.ts apps/web/src/lib/event-radio/concurrency.ts apps/web/src/lib/event-radio/__tests__/tts.test.ts apps/web/src/lib/event-radio/__tests__/concurrency.test.ts
git commit -m "feat(web): ElevenLabs TTS client with retries and a concurrency helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 8: Storage paths and Supabase reads (`storage.ts`, `gather.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/storage.ts`, `apps/web/src/lib/event-radio/gather.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `toPublicEvent`, `PublicEvent` (Task 3), `WeekWindow` (Task 2), `ExistingRow` (Task 5), `RadioKind` (Task 4).
- Produces: `RADIO_BUCKET`, `segmentObjectPath(weekKey, kind, scopeKey, contentHash)`, `objectPathFromPublicUrl(url): string | null`, `uploadSegmentAudio(supabase, path, audio): Promise<string>`, `deleteSegmentAudio(supabase, urls): Promise<void>`; `EVENT_SELECT`, `gatherWeekEvents(supabase, window): Promise<PublicEvent[]>`, `loadExistingRows(supabase): Promise<ExistingRow[]>`, `readSetting(supabase, key): Promise<string | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/event-radio/__tests__/storage.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { objectPathFromPublicUrl, segmentObjectPath } from "../storage";

test("segmentObjectPath is content addressed", () => {
  assert.equal(
    segmentObjectPath("2026-W36", "event", "abc", "0123456789abcdef"),
    "radio/2026-W36/event-abc-01234567.mp3",
  );
});

test("objectPathFromPublicUrl extracts the bucket-relative path", () => {
  const url = "https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/story-audio/radio/2026-W36/intro-2026-09-04-deadbeef.mp3";
  assert.equal(objectPathFromPublicUrl(url), "radio/2026-W36/intro-2026-09-04-deadbeef.mp3");
  assert.equal(objectPathFromPublicUrl("https://example.org/other.mp3"), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/storage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `storage.ts`**

```ts
// apps/web/src/lib/event-radio/storage.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RadioKind } from "./select";

export const RADIO_BUCKET = "story-audio";

export function segmentObjectPath(
  weekKey: string,
  kind: RadioKind,
  scopeKey: string,
  contentHash: string,
): string {
  return `radio/${weekKey}/${kind}-${scopeKey}-${contentHash.slice(0, 8)}.mp3`;
}

export function objectPathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${RADIO_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export async function uploadSegmentAudio(
  supabase: SupabaseClient,
  path: string,
  audio: Buffer,
): Promise<string> {
  const { error } = await supabase.storage.from(RADIO_BUCKET).upload(path, audio, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`Upload fehlgeschlagen (${path}): ${error.message}`);
  return supabase.storage.from(RADIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deleteSegmentAudio(supabase: SupabaseClient, urls: string[]): Promise<void> {
  const paths = urls.map(objectPathFromPublicUrl).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(RADIO_BUCKET).remove(paths);
  if (error) console.error("[EventRadio] delete audio failed:", error.message);
}
```

- [ ] **Step 4: Implement `gather.ts`**

```ts
// apps/web/src/lib/event-radio/gather.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { toPublicEvent, type PublicEvent } from "./hash";
import type { ExistingRow } from "./plan";
import type { RadioKind } from "./select";
import type { WeekWindow } from "./window";

/** Public fields only (spec 6.1). Never organizer_email / organizer_phone. */
export const EVENT_SELECT =
  "id, title, description, date, time, end_time, location, organizer_name, category, ticket_price, website_url, is_cancelled";

/** Same query as apps/expo fetchThisWeekEvents: approved, today..Sunday, by date, max 10. */
export async function gatherWeekEvents(
  supabase: SupabaseClient,
  window: WeekWindow,
): Promise<PublicEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("status", "approved")
    .gte("date", window.start)
    .lte("date", window.end)
    .order("date", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Events laden fehlgeschlagen: ${error.message}`);
  return (data ?? []).map((row) => toPublicEvent(row as unknown as Record<string, unknown>));
}

type SegmentRowRaw = {
  id: string;
  kind: RadioKind;
  scope_key: string;
  content_hash: string;
  audio_url: string;
  script: string;
  duration_ms: number;
  created_at: string;
  events: { date: string } | null;
};

/** Every row (the table stays small: expiry runs daily). */
export async function loadExistingRows(supabase: SupabaseClient): Promise<ExistingRow[]> {
  const { data, error } = await supabase
    .from("event_radio_segments")
    .select("id, kind, scope_key, content_hash, audio_url, script, duration_ms, created_at, events(date)");
  if (error) throw new Error(`Segmente laden fehlgeschlagen: ${error.message}`);
  return ((data ?? []) as unknown as SegmentRowRaw[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    scope_key: r.scope_key,
    content_hash: r.content_hash,
    audio_url: r.audio_url,
    script: r.script,
    duration_ms: r.duration_ms,
    created_at: r.created_at,
    event_date: r.events?.date ?? null,
  }));
}

export async function readSetting(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error(`[EventRadio] app_settings ${key}:`, error.message);
    return null;
  }
  const value = (data as { value: string | null } | null)?.value ?? null;
  return value && value.trim() !== "" ? value : null;
}
```

- [ ] **Step 5: Run the test and typecheck**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/storage.test.ts`
Expected: 2 tests pass.
Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "event-radio"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/event-radio/storage.ts apps/web/src/lib/event-radio/gather.ts apps/web/src/lib/event-radio/__tests__/storage.test.ts
git commit -m "feat(web): event-radio storage paths and Supabase reads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 9: Orchestration (`generate.ts`)

**Files:**
- Create: `apps/web/src/lib/event-radio/generate.ts`
- Test: `apps/web/src/lib/event-radio/__tests__/generate-helpers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 8, `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `generateEventRadio(opts?: { force?: boolean; dryRun?: boolean }): Promise<GenerateResult>`, type `GenerateResult`, `concurrencyFromEnv(env): number`, `SETTING_VOICE_ID = "event_radio_voice_id"`.

- [ ] **Step 1: Write the failing test for the pure helper**

```ts
// apps/web/src/lib/event-radio/__tests__/generate-helpers.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { concurrencyFromEnv } from "../generate-helpers";

test("concurrencyFromEnv defaults to 2 and clamps to 1..5", () => {
  assert.equal(concurrencyFromEnv({}), 2);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "4" }), 4);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "0" }), 1);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "9" }), 5);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "abc" }), 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/generate-helpers.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `generate-helpers.ts`** (pure, so it stays testable without `@/` imports)

```ts
// apps/web/src/lib/event-radio/generate-helpers.ts
/** Parallel ElevenLabs requests: default 2, clamped to 1..5 (Starter allows 3, Creator 5). */
export function concurrencyFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.ELEVENLABS_CONCURRENCY;
  if (raw === undefined || raw.trim() === "") return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(5, Math.floor(n)));
}
```

Run: `cd apps/web && pnpm exec tsx --test src/lib/event-radio/__tests__/generate-helpers.test.ts`
Expected: 1 test passes.

- [ ] **Step 4: Implement `generate.ts`**

```ts
// apps/web/src/lib/event-radio/generate.ts
// Orchestrates one Wochen-Radio run (spec section 6.5). Called by the daily
// cron and by the admin "Jetzt neu generieren" route.
import { createAdminClient } from "@/lib/supabase/admin";
import { mapWithConcurrency } from "./concurrency";
import { gatherWeekEvents, loadExistingRows, readSetting } from "./gather";
import { concurrencyFromEnv } from "./generate-helpers";
import { planExpiry, planScopes, staleRowsForScope, type ScopePlan } from "./plan";
import { writeEventSegments, writeIntro, writeOutro } from "./scripts";
import { scopeId } from "./select";
import { deleteSegmentAudio, segmentObjectPath, uploadSegmentAudio } from "./storage";
import { synthesizeSpeech, TTS_MODEL_ID } from "./tts";
import { berlinToday, previousWeekKey, weekWindow, type WeekWindow } from "./window";

export const SETTING_VOICE_ID = "event_radio_voice_id";

export type GenerateOptions = { force?: boolean; dryRun?: boolean };

export type GenerateResult = {
  skipped_reason?: "api_key_missing" | "voice_id_missing";
  window: WeekWindow;
  generated: { intro: boolean; events: string[]; outro: boolean };
  reused: string[];
  scripts?: { intro?: string; outro?: string; events: Record<string, string> };
  errors: Array<{ scope: string; message: string }>;
  expired: number;
};

type Job = { plan: ScopePlan; text: string; previousText?: string };

export async function generateEventRadio(opts: GenerateOptions = {}): Promise<GenerateResult> {
  const supabase = createAdminClient();
  const todayKey = berlinToday();
  const window = weekWindow(todayKey);
  const result: GenerateResult = {
    window,
    generated: { intro: false, events: [], outro: false },
    reused: [],
    errors: [],
    expired: 0,
  };

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ...result, skipped_reason: "api_key_missing" };
  const voiceId = await readSetting(supabase, SETTING_VOICE_ID);
  if (!voiceId) return { ...result, skipped_reason: "voice_id_missing" };

  const ctx = { voiceId, modelId: TTS_MODEL_ID };
  const events = await gatherWeekEvents(supabase, window);
  const existing = await loadExistingRows(supabase);
  const plan = planScopes({ events, todayKey, weekKey: window.weekKey, existing, ctx, force: Boolean(opts.force) });

  // 1. Scripts (Claude). Failures here abort the run: nothing partial is written.
  const scripts: NonNullable<GenerateResult["scripts"]> = { events: {} };
  if (plan.intro?.needed) scripts.intro = await writeIntro(events, todayKey);
  if (plan.outro.needed) scripts.outro = await writeOutro();
  const neededEvents = plan.events.filter((p) => p.needed);
  if (neededEvents.length > 0) {
    const map = await writeEventSegments(neededEvents.map((p) => p.event!));
    for (const p of neededEvents) scripts.events[p.scopeKey] = map.get(p.scopeKey)!;
  }
  result.reused = [
    ...(plan.intro && !plan.intro.needed ? ["intro"] : []),
    ...(!plan.outro.needed ? ["outro"] : []),
    ...plan.events.filter((p) => !p.needed).map((p) => `event:${p.scopeKey}`),
  ];
  if (opts.dryRun) return { ...result, scripts };

  // 2. Text to speech + upload + row, one job per needed scope.
  const introText =
    scripts.intro ??
    (plan.intro ? existing.find((r) => r.kind === "intro" && r.scope_key === plan.intro!.scopeKey)?.script : undefined);
  const jobs: Job[] = [];
  if (plan.intro?.needed && scripts.intro) jobs.push({ plan: plan.intro, text: scripts.intro });
  for (const p of neededEvents) jobs.push({ plan: p, text: scripts.events[p.scopeKey], previousText: introText });
  if (plan.outro.needed && scripts.outro) jobs.push({ plan: plan.outro, text: scripts.outro, previousText: introText });

  const settled = await mapWithConcurrency(jobs, concurrencyFromEnv(process.env), async (job) => {
    const tts = await synthesizeSpeech({ text: job.text, voiceId, apiKey, previousText: job.previousText });
    const path = segmentObjectPath(window.weekKey, job.plan.kind, job.plan.scopeKey, job.plan.hash);
    const audioUrl = await uploadSegmentAudio(supabase, path, tts.audio);
    const { data: saved, error } = await supabase
      .from("event_radio_segments")
      .upsert(
        {
          kind: job.plan.kind,
          event_id: job.plan.kind === "event" ? job.plan.scopeKey : null,
          scope_key: job.plan.scopeKey,
          week_key: window.weekKey,
          valid_on: job.plan.kind === "intro" ? job.plan.scopeKey : null,
          content_hash: job.plan.hash,
          script: job.text,
          audio_url: audioUrl,
          duration_ms: tts.durationMs,
          voice_id: voiceId,
          model_id: TTS_MODEL_ID,
          request_id: tts.requestId,
        },
        { onConflict: "kind,scope_key,content_hash" },
      )
      .select("id")
      .single();
    if (error || !saved) throw new Error(`Speichern fehlgeschlagen: ${error?.message ?? "keine Zeile"}`);

    const stale = staleRowsForScope(existing, job.plan.kind, job.plan.scopeKey, saved.id);
    if (stale.length > 0) {
      await deleteSegmentAudio(supabase, stale.map((r) => r.audio_url));
      await supabase.from("event_radio_segments").delete().in("id", stale.map((r) => r.id));
    }
    return job.plan;
  });

  settled.forEach((s, i) => {
    const job = jobs[i];
    if (s.ok) {
      if (job.plan.kind === "intro") result.generated.intro = true;
      else if (job.plan.kind === "outro") result.generated.outro = true;
      else result.generated.events.push(job.plan.scopeKey);
    } else {
      const message = s.error instanceof Error ? s.error.message : String(s.error);
      console.error(`[EventRadio] ${scopeId(job.plan.kind, job.plan.scopeKey)} failed:`, message);
      result.errors.push({ scope: scopeId(job.plan.kind, job.plan.scopeKey), message });
    }
  });

  // 3. Expiry pass (files first, then rows).
  const expired = planExpiry({ existing, todayKey, weekKey: window.weekKey, previousWeekKey: previousWeekKey(todayKey) });
  if (expired.length > 0) {
    await deleteSegmentAudio(supabase, expired.map((r) => r.audio_url));
    const { error } = await supabase.from("event_radio_segments").delete().in("id", expired.map((r) => r.id));
    if (error) result.errors.push({ scope: "expiry", message: error.message });
    else result.expired = expired.length;
  }

  return result;
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "event-radio"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/event-radio/generate.ts apps/web/src/lib/event-radio/generate-helpers.ts apps/web/src/lib/event-radio/__tests__/generate-helpers.test.ts
git commit -m "feat(web): event-radio generation orchestration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 10: Cron route, admin generate route, cron schedule, env example

**Files:**
- Create: `apps/web/src/app/api/cron/event-radio/route.ts`, `apps/web/src/app/api/event-radio/generate/route.ts`
- Modify: `apps/web/vercel.json` (crons array), `apps/web/.env.example` (after the `ANTHROPIC_API_KEY` block)

**Interfaces:**
- Consumes: `generateEventRadio` (Task 9), `requireAdmin` from `@/lib/miniapp/http`.
- Produces: `GET /api/cron/event-radio` (bearer `CRON_SECRET`), `POST /api/event-radio/generate` with body `{ force?: boolean; dryRun?: boolean }` returning `GenerateResult`.

- [ ] **Step 1: Cron route**

```ts
// apps/web/src/app/api/cron/event-radio/route.ts
import { NextRequest, NextResponse } from "next/server"
import { generateEventRadio } from "@/lib/event-radio/generate"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await generateEventRadio()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Event radio cron error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Admin route**

```ts
// apps/web/src/app/api/event-radio/generate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/miniapp/http"
import { generateEventRadio } from "@/lib/event-radio/generate"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: { force?: boolean; dryRun?: boolean } = {}
  try {
    body = (await req.json()) as { force?: boolean; dryRun?: boolean }
  } catch {
    body = {}
  }
  try {
    const result = await generateEventRadio({ force: Boolean(body.force), dryRun: Boolean(body.dryRun) })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Event radio generate error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generierung fehlgeschlagen" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Cron schedule**

In `apps/web/vercel.json`, add to the `crons` array after the `newsletter-draft` entry:

```json
    {
      "path": "/api/cron/event-radio",
      "schedule": "0 4 * * *"
    },
```

- [ ] **Step 4: Env example**

In `apps/web/.env.example`, after the `ANTHROPIC_API_KEY=your_anthropic_api_key` line add:

```
# Wochen-Radio (event story narration) - ElevenLabs text to speech
ELEVENLABS_API_KEY=your_elevenlabs_api_key
# Optional: parallel ElevenLabs requests (1-5, default 2; Starter plan allows 3)
# ELEVENLABS_CONCURRENCY=2
```

- [ ] **Step 5: Validate JSON and typecheck**

Run: `cd apps/web && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"`
Expected: `ok`.
Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "event-radio"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/cron/event-radio/route.ts apps/web/src/app/api/event-radio/generate/route.ts apps/web/vercel.json apps/web/.env.example
git commit -m "feat(web): event-radio daily cron and admin generate route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 11: Settings and overview server actions

**Files:**
- Modify: `apps/web/src/app/actions/app-settings.ts` (append)
- Create: `apps/web/src/app/actions/event-radio.ts`

**Interfaces:**
- Consumes: `getAppSetting`, `setAppSetting` (module-private in app-settings.ts, same file), `isAuthenticated` from `@/lib/auth/session`, `createAdminClient`, `gatherWeekEvents`, `loadExistingRows`, `readSetting` (Task 8), `planScopes` (Task 5), `pickLatestPerScope`, `scopeId` (Task 4), `berlinToday`, `weekWindow` (Task 2), `TTS_MODEL_ID` (Task 7), `SETTING_VOICE_ID` (Task 9).
- Produces: `getEventRadioSettings(): Promise<{ voiceId: string | null; enabled: boolean }>`, `setEventRadioVoiceId(voiceId: string | null)`, `setEventRadioEnabled(enabled: boolean)`; `getEventRadioOverview(): Promise<EventRadioOverview>` with

```ts
export type SegmentView = { audioUrl: string; script: string; durationMs: number; createdAt: string }
export type EventRadioOverview = {
  enabled: boolean
  voiceId: string | null
  window: { start: string; end: string; weekKey: string }
  lastGeneratedAt: string | null
  intro: SegmentView | null
  outro: SegmentView | null
  events: Array<{ id: string; title: string; date: string; segment: SegmentView | null; status: "current" | "stale" | "missing" }>
}
```

- [ ] **Step 1: Append to `app-settings.ts`**

```ts
const EVENT_RADIO_VOICE_KEY = "event_radio_voice_id"
const EVENT_RADIO_ENABLED_KEY = "event_radio_enabled"

/** Wochen-Radio: ElevenLabs voice id + app kill switch (missing = enabled). */
export async function getEventRadioSettings(): Promise<{ voiceId: string | null; enabled: boolean }> {
  const [voiceId, enabled] = await Promise.all([
    getAppSetting(EVENT_RADIO_VOICE_KEY),
    getAppSetting(EVENT_RADIO_ENABLED_KEY),
  ])
  return { voiceId: voiceId?.trim() || null, enabled: enabled !== "false" }
}

export async function setEventRadioVoiceId(voiceId: string | null) {
  if (!(await isAuthenticated())) return { success: false as const, error: "Nicht autorisiert" }
  const result = await setAppSetting(EVENT_RADIO_VOICE_KEY, voiceId?.trim() || null)
  if (result.success) revalidatePath("/admin/dashboard/events")
  return result
}

export async function setEventRadioEnabled(enabled: boolean) {
  if (!(await isAuthenticated())) return { success: false as const, error: "Nicht autorisiert" }
  const result = await setAppSetting(EVENT_RADIO_ENABLED_KEY, enabled ? "true" : "false")
  if (result.success) revalidatePath("/admin/dashboard/events")
  return result
}
```

Add the import at the top of the file: `import { isAuthenticated } from "@/lib/auth/session"`.

- [ ] **Step 2: Create `event-radio.ts` action**

```ts
// apps/web/src/app/actions/event-radio.ts
"use server"

import { isAuthenticated } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { gatherWeekEvents, loadExistingRows } from "@/lib/event-radio/gather"
import { planScopes } from "@/lib/event-radio/plan"
import { pickLatestPerScope, scopeId } from "@/lib/event-radio/select"
import { TTS_MODEL_ID } from "@/lib/event-radio/tts"
import { berlinToday, weekWindow } from "@/lib/event-radio/window"
import { getEventRadioSettings } from "./app-settings"

export type SegmentView = { audioUrl: string; script: string; durationMs: number; createdAt: string }

export type EventRadioOverview = {
  enabled: boolean
  voiceId: string | null
  window: { start: string; end: string; weekKey: string }
  lastGeneratedAt: string | null
  intro: SegmentView | null
  outro: SegmentView | null
  events: Array<{
    id: string
    title: string
    date: string
    segment: SegmentView | null
    status: "current" | "stale" | "missing"
  }>
}

export async function getEventRadioOverview(): Promise<EventRadioOverview> {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert")
  const supabase = createAdminClient()
  const settings = await getEventRadioSettings()
  const todayKey = berlinToday()
  const window = weekWindow(todayKey)
  const [events, existing] = await Promise.all([gatherWeekEvents(supabase, window), loadExistingRows(supabase)])
  const latest = pickLatestPerScope(existing)
  const view = (
    row: { audio_url: string; script: string; duration_ms: number; created_at: string } | undefined,
  ): SegmentView | null =>
    row ? { audioUrl: row.audio_url, script: row.script, durationMs: row.duration_ms, createdAt: row.created_at } : null

  const ctx = { voiceId: settings.voiceId ?? "", modelId: TTS_MODEL_ID }
  const plan = planScopes({ events, todayKey, weekKey: window.weekKey, existing, ctx, force: false })

  const lastGeneratedAt = existing.reduce<string | null>(
    (max, r) => (!max || Date.parse(r.created_at) > Date.parse(max) ? r.created_at : max),
    null,
  )

  return {
    enabled: settings.enabled,
    voiceId: settings.voiceId,
    window,
    lastGeneratedAt,
    intro: view(latest.get(scopeId("intro", todayKey))),
    outro: view(latest.get(scopeId("outro", window.weekKey))),
    events: plan.events.map((p) => {
      const row = latest.get(scopeId("event", p.scopeKey))
      return {
        id: p.scopeKey,
        title: p.event?.title ?? "",
        date: p.event?.date ?? "",
        segment: view(row),
        status: !row ? "missing" : p.needed ? "stale" : "current",
      }
    }),
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "event-radio|app-settings"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/actions/app-settings.ts apps/web/src/app/actions/event-radio.ts
git commit -m "feat(web): event-radio settings and overview server actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 12: Admin panel `EventRadioPanel`

**Files:**
- Create: `apps/web/src/app/admin/dashboard/events/_components/EventRadioPanel.tsx`
- Modify: `apps/web/src/app/admin/dashboard/events/page.tsx` (import at line 24 area, render after `<EventStoryAudioPanel />`)

**Interfaces:**
- Consumes: `getEventRadioOverview`, `EventRadioOverview` (Task 11), `setEventRadioVoiceId`, `setEventRadioEnabled` (Task 11), `POST /api/event-radio/generate` (Task 10), UI kit `Button`, `Input`, `Switch`, `Skeleton`, `Badge`, `Dialog*`, `Collapsible*`, `toast` from sonner, icons from lucide-react.

- [ ] **Step 1: Write the panel**

```tsx
// apps/web/src/app/admin/dashboard/events/_components/EventRadioPanel.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, FileText, Radio, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { setEventRadioEnabled, setEventRadioVoiceId } from "@/app/actions/app-settings"
import { getEventRadioOverview, type EventRadioOverview, type SegmentView } from "@/app/actions/event-radio"

type DryRunScripts = { intro?: string; outro?: string; events: Record<string, string> }

function formatDe(iso: string | null): string {
  if (!iso) return "noch nie"
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
}

function SegmentRow({ label, meta, segment, status }: {
  label: string
  meta?: string
  segment: SegmentView | null
  status?: "current" | "stale" | "missing"
}) {
  const badge =
    status === "current" ? <Badge variant="secondary">Aktuell</Badge>
    : status === "stale" ? <Badge variant="outline">Veraltet</Badge>
    : status === "missing" ? <Badge variant="destructive">Fehlt</Badge>
    : null
  return (
    <div className="rounded-[10px] border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {badge}
      </div>
      {segment ? (
        <>
          <audio controls preload="none" src={segment.audioUrl} className="w-full h-9" />
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronDown className="h-3 w-3" /> Skript anzeigen
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 text-sm whitespace-pre-wrap">{segment.script}</p>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Noch kein Beitrag generiert.</p>
      )}
    </div>
  )
}

/**
 * Wochen-Radio: Mecky's narrated event stories. Lists the current week's
 * clips, holds the voice id and the app kill switch, and triggers generation.
 */
export function EventRadioPanel() {
  const [overview, setOverview] = useState<EventRadioOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [voiceInput, setVoiceInput] = useState("")
  const [busy, setBusy] = useState<"dry" | "force" | null>(null)
  const [scripts, setScripts] = useState<DryRunScripts | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getEventRadioOverview()
      setOverview(data)
      setVoiceInput(data.voiceId ?? "")
    } catch (err) {
      toast.error("Wochen-Radio konnte nicht geladen werden", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const saveVoice = async () => {
    const result = await setEventRadioVoiceId(voiceInput || null)
    if (!result.success) return toast.error("Fehler beim Speichern", { description: result.error })
    toast.success("Stimme gespeichert")
    void load()
  }

  const toggleEnabled = async (enabled: boolean) => {
    setOverview((o) => (o ? { ...o, enabled } : o))
    const result = await setEventRadioEnabled(enabled)
    if (!result.success) {
      toast.error("Fehler beim Speichern", { description: result.error })
      void load()
    }
  }

  const generate = async (mode: "dry" | "force") => {
    setBusy(mode)
    try {
      const res = await fetch("/api/event-radio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "dry" ? { dryRun: true } : { force: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      if (data.skipped_reason === "voice_id_missing") return toast.error("Bitte zuerst eine Stimme (Voice ID) speichern.")
      if (data.skipped_reason === "api_key_missing") return toast.error("ELEVENLABS_API_KEY fehlt auf dem Server.")
      if (mode === "dry") {
        setScripts(data.scripts ?? { events: {} })
        return
      }
      const failed: Array<{ scope: string; message: string }> = data.errors ?? []
      const count = (data.generated?.events?.length ?? 0) + (data.generated?.intro ? 1 : 0) + (data.generated?.outro ? 1 : 0)
      if (failed.length > 0) toast.warning(`${count} Beiträge erzeugt, ${failed.length} fehlgeschlagen`, { description: failed[0].message })
      else toast.success(`${count} Beiträge erzeugt`)
      void load()
    } catch (err) {
      toast.error("Generierung fehlgeschlagen", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="text-base font-medium">Wochen-Radio</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">In der App aktiv</span>
          <Switch checked={overview?.enabled ?? true} onCheckedChange={toggleEnabled} disabled={loading} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Mecky moderiert die Event-Stories: ein eigener Beitrag pro Veranstaltung, dazu Intro und Outro.
        Wird täglich um sechs Uhr neu erzeugt, nur geänderte Veranstaltungen werden neu eingesprochen.
        Zuletzt generiert: {formatDe(overview?.lastGeneratedAt ?? null)}.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">ElevenLabs Voice ID (Mecky)</label>
          <Input value={voiceInput} onChange={(e) => setVoiceInput(e.target.value)} placeholder="z. B. 21m00Tcm4TlvDq8ikWAM" />
        </div>
        <Button variant="outline" onClick={saveVoice} disabled={loading}>Speichern</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => generate("dry")} disabled={busy !== null}>
          <FileText className="h-4 w-4 mr-1" /> {busy === "dry" ? "Schreibt…" : "Skripte prüfen"}
        </Button>
        <Button onClick={() => generate("force")} disabled={busy !== null}>
          <RefreshCw className={`h-4 w-4 mr-1 ${busy === "force" ? "animate-spin" : ""}`} />
          {busy === "force" ? "Generiert…" : "Jetzt neu generieren"}
        </Button>
      </div>

      {loading || !overview ? (
        <Skeleton className="h-[120px] w-full rounded-[10px]" />
      ) : (
        <div className="space-y-2">
          <SegmentRow label="Intro" meta={`für ${overview.window.start}`} segment={overview.intro} />
          {overview.events.map((e) => (
            <SegmentRow key={e.id} label={e.title} meta={e.date} segment={e.segment} status={e.status} />
          ))}
          <SegmentRow label="Outro" meta={`Woche ${overview.window.weekKey}`} segment={overview.outro} />
        </div>
      )}

      <Dialog open={scripts !== null} onOpenChange={(open) => !open && setScripts(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Skripte (Probelauf, keine Audio-Kosten)</DialogTitle>
          </DialogHeader>
          {scripts ? (
            <div className="space-y-4 text-sm">
              {scripts.intro ? (<div><p className="font-medium">Intro</p><p className="whitespace-pre-wrap">{scripts.intro}</p></div>) : null}
              {Object.entries(scripts.events).map(([id, script]) => (
                <div key={id}>
                  <p className="font-medium">{overview?.events.find((e) => e.id === id)?.title ?? id}</p>
                  <p className="whitespace-pre-wrap">{script}</p>
                </div>
              ))}
              {scripts.outro ? (<div><p className="font-medium">Outro</p><p className="whitespace-pre-wrap">{scripts.outro}</p></div>) : null}
              {!scripts.intro && !scripts.outro && Object.keys(scripts.events).length === 0 ? (
                <p className="text-muted-foreground">Alles aktuell, nichts neu zu schreiben.</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

If `Badge` has no `variant="destructive"` or `Switch` exports differ, open the component file in `apps/web/src/components/ui/` and use the variants it actually defines.

- [ ] **Step 2: Wire into the events page**

In `apps/web/src/app/admin/dashboard/events/page.tsx`, next to `import { EventStoryAudioPanel } from "./_components/EventStoryAudioPanel"` add
`import { EventRadioPanel } from "./_components/EventRadioPanel"`, and directly after `<EventStoryAudioPanel />` render `<EventRadioPanel />`.

- [ ] **Step 3: Typecheck and lint the two files**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "EventRadioPanel|dashboard/events/page"`
Expected: no output.
Run: `cd apps/web && pnpm exec eslint src/app/admin/dashboard/events/_components/EventRadioPanel.tsx`
Expected: no errors.

- [ ] **Step 4: Manual check in the browser**

Run `cd apps/web && pnpm dev`, open `http://localhost:3000/admin/dashboard/events`, log in as admin. Expected: the "Wochen-Radio" panel renders below the background-audio panel with the switch, the voice id field, the two buttons, and a list showing "Fehlt" for every event (no rows yet). Without `ELEVENLABS_API_KEY` in `.env.local`, "Jetzt neu generieren" shows the API-key toast.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/dashboard/events/_components/EventRadioPanel.tsx apps/web/src/app/admin/dashboard/events/page.tsx
git commit -m "feat(web): Wochen-Radio admin panel on the events dashboard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 13: One-off setup script (voice previews, voice create, music bed)

**Files:**
- Create: `apps/web/scripts/event-radio-setup.mjs`

**Interfaces:**
- Produces: CLI `node --env-file=.env.local scripts/event-radio-setup.mjs <voice-preview|voice-create|bed> [flags]` run from `apps/web`.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// apps/web/scripts/event-radio-setup.mjs
// One-off setup for the Wochen-Radio (spec section 8). Run from apps/web:
//   node --env-file=.env.local scripts/event-radio-setup.mjs voice-preview --out ../../output/event-radio
//   node --env-file=.env.local scripts/event-radio-setup.mjs voice-create --generated-voice-id <id> --name Mecky
//   node --env-file=.env.local scripts/event-radio-setup.mjs bed --seconds 90 --out ../../output/event-radio [--upload]
// Needs ELEVENLABS_API_KEY; `bed --upload` also needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from "node:fs/promises"
import path from "node:path"

const BASE = "https://api.elevenlabs.io"

const DEFAULT_VOICE_DESCRIPTION =
  "Warm, friendly male voice in his late thirties, a relaxed northern German local radio host from Mecklenburg. Clear articulation, a gentle smile in the voice, medium-low pitch, unhurried pace, natural and trustworthy, never salesy."

const DEFAULT_SAMPLE_TEXT =
  "Moin Röbel! Hier ist Mecky mit dem Wochen-Radio. Am Samstag ab vierzehn Uhr gibt es am Hafen Musik, Bratwurst und gute Laune, und am Sonntag lädt die Bibliothek zur Lesung ein. Kommt vorbei, ich freu mich auf euch!"

const DEFAULT_BED_PROMPT =
  "Warm, laid-back acoustic bed for a small-town local radio show: soft fingerpicked guitar, light brushed percussion, a hint of upright bass, unobtrusive and loopable, steady relaxed mood, no vocals, no melody hooks that fight with speech."

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  return v === undefined || v.startsWith("--") ? true : v
}

function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Fehlt: ${name}`)
    process.exit(1)
  }
  return v
}

async function elevenJson(pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "xi-api-key": requireEnv("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res
}

async function ensureOut() {
  const out = arg("out")
  if (!out || out === true) {
    console.error("--out <dir> ist Pflicht")
    process.exit(1)
  }
  await fs.mkdir(out, { recursive: true })
  return out
}

async function voicePreview() {
  const out = await ensureOut()
  const description = arg("description", DEFAULT_VOICE_DESCRIPTION)
  const text = arg("text", DEFAULT_SAMPLE_TEXT)
  const res = await elevenJson("/v1/text-to-voice/design", {
    voice_description: description,
    text,
    model_id: "eleven_multilingual_ttv_v2",
    auto_generate_text: false,
  })
  const json = await res.json()
  const previews = json.previews ?? []
  for (const [i, p] of previews.entries()) {
    const b64 = p.audio_base_64 ?? p.audio_base64
    const file = path.join(out, `mecky-preview-${i + 1}.mp3`)
    await fs.writeFile(file, Buffer.from(b64, "base64"))
    console.log(`${file}\n  generated_voice_id: ${p.generated_voice_id}`)
  }
  console.log(`\n${previews.length} Previews. Anhören, dann: voice-create --generated-voice-id <id> --name Mecky`)
}

async function voiceCreate() {
  const generatedVoiceId = arg("generated-voice-id")
  if (!generatedVoiceId || generatedVoiceId === true) {
    console.error("--generated-voice-id <id> ist Pflicht")
    process.exit(1)
  }
  const res = await elevenJson("/v1/text-to-voice", {
    voice_name: arg("name", "Mecky"),
    voice_description: arg("description", DEFAULT_VOICE_DESCRIPTION),
    generated_voice_id: generatedVoiceId,
  })
  const json = await res.json()
  console.log(`voice_id: ${json.voice_id}\nIn /admin/dashboard/events unter Wochen-Radio eintragen.`)
}

async function bed() {
  const out = await ensureOut()
  const seconds = Number(arg("seconds", "90"))
  const res = await elevenJson("/v1/music?output_format=mp3_44100_128", {
    prompt: arg("prompt", DEFAULT_BED_PROMPT),
    music_length_ms: Math.round(seconds * 1000),
    model_id: "music_v2",
    force_instrumental: true,
  })
  const audio = Buffer.from(await res.arrayBuffer())
  const file = path.join(out, "wochen-radio-bed.mp3")
  await fs.writeFile(file, audio)
  console.log(`${file} (${Math.round(audio.length / 1024)} KB)`)
  if (arg("upload") === true) {
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
    const objectPath = "global/wochen-radio-bed.mp3"
    const { error } = await supabase.storage
      .from("story-audio")
      .upload(objectPath, audio, { contentType: "audio/mpeg", cacheControl: "3600", upsert: true })
    if (error) throw new Error(`Upload: ${error.message}`)
    const url = supabase.storage.from("story-audio").getPublicUrl(objectPath).data.publicUrl
    const { error: settingError } = await supabase
      .from("app_settings")
      .upsert({ key: "event_stories_audio_url", value: url, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (settingError) throw new Error(`app_settings: ${settingError.message}`)
    console.log(`Hochgeladen und als Hintergrund-Audio gesetzt:\n${url}`)
  }
}

const command = process.argv[2]
const commands = { "voice-preview": voicePreview, "voice-create": voiceCreate, bed }
if (!commands[command]) {
  console.error(`Nutzung: event-radio-setup.mjs <${Object.keys(commands).join("|")}> [--out <dir>] ...`)
  process.exit(1)
}
commands[command]().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Smoke test the argument parsing without an API key**

Run: `cd apps/web && node scripts/event-radio-setup.mjs voice-preview`
Expected: prints `--out <dir> ist Pflicht` and exits 1.
Run: `cd apps/web && ELEVENLABS_API_KEY= node scripts/event-radio-setup.mjs voice-preview --out /tmp/x 2>&1 | head -2`
Expected: `Fehlt: ELEVENLABS_API_KEY`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/event-radio-setup.mjs
git commit -m "feat(web): event-radio setup script for Mecky voice design and music bed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 14: Expo pure selection helpers (`lib/event-radio-select.ts`)

**Files:**
- Create: `apps/expo/lib/event-radio-select.ts`
- Test: `apps/expo/lib/__tests__/event-radio-select.test.ts`

**Interfaces:**
- Produces: types `RadioSegment = { audioUrl: string; durationMs: number }`, `EventRadioBundle = { enabled: boolean; intro: RadioSegment | null; outro: RadioSegment | null; byEventId: Record<string, RadioSegment> }`, `RadioSegmentRow = { kind: 'intro' | 'event' | 'outro'; scope_key: string; audio_url: string; duration_ms: number; created_at: string }`, `EMPTY_RADIO_BUNDLE`, `localDateKey(now?: Date): string`, `isoWeekKey(dateKey: string): string`, `pickLatestPerScope(rows)`, `assembleRadioBundle(rows, eventIds, todayKey, weekKey): EventRadioBundle`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/expo/lib/__tests__/event-radio-select.test.ts
import {
  assembleRadioBundle,
  isoWeekKey,
  localDateKey,
  pickLatestPerScope,
  type RadioSegmentRow,
} from '@/lib/event-radio-select';

const row = (p: Partial<RadioSegmentRow> & Pick<RadioSegmentRow, 'kind' | 'scope_key'>): RadioSegmentRow => ({
  audio_url: `https://x/${p.kind}-${p.scope_key}.mp3`,
  duration_ms: 20000,
  created_at: '2026-09-04T04:00:00+00:00',
  ...p,
});

describe('event radio selection', () => {
  it('localDateKey formats the device-local date', () => {
    expect(localDateKey(new Date(2026, 8, 4, 23, 30))).toBe('2026-09-04');
    expect(localDateKey(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05');
  });

  it('isoWeekKey matches the web helper', () => {
    expect(isoWeekKey('2026-09-04')).toBe('2026-W36');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
  });

  it('pickLatestPerScope keeps the newest row per scope', () => {
    const latest = pickLatestPerScope([
      row({ kind: 'event', scope_key: 'a', created_at: '2026-09-01T00:00:00Z', audio_url: 'old' }),
      row({ kind: 'event', scope_key: 'a', created_at: '2026-09-03T00:00:00Z', audio_url: 'new' }),
    ]);
    expect(latest.get('event:a')?.audio_url).toBe('new');
  });

  it('assembleRadioBundle maps intro, outro and events for the current day and week', () => {
    const bundle = assembleRadioBundle(
      [
        row({ kind: 'intro', scope_key: '2026-09-04' }),
        row({ kind: 'intro', scope_key: '2026-09-03', audio_url: 'yesterday' }),
        row({ kind: 'outro', scope_key: '2026-W36' }),
        row({ kind: 'event', scope_key: 'a' }),
        row({ kind: 'event', scope_key: 'z', audio_url: 'not-this-week' }),
      ],
      ['a', 'b'],
      '2026-09-04',
      '2026-W36',
    );
    expect(bundle.enabled).toBe(true);
    expect(bundle.intro?.audioUrl).toBe('https://x/intro-2026-09-04.mp3');
    expect(bundle.outro?.durationMs).toBe(20000);
    expect(Object.keys(bundle.byEventId)).toEqual(['a']);
  });

  it('assembleRadioBundle yields nulls when nothing matches', () => {
    const bundle = assembleRadioBundle([], ['a'], '2026-09-04', '2026-W36');
    expect(bundle.intro).toBeNull();
    expect(bundle.outro).toBeNull();
    expect(bundle.byEventId).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/expo && pnpm exec jest lib/__tests__/event-radio-select.test.ts`
Expected: FAIL, cannot find module `@/lib/event-radio-select`.

- [ ] **Step 3: Implement `lib/event-radio-select.ts`**

```ts
// apps/expo/lib/event-radio-select.ts
// Pure helpers for the Wochen-Radio narration bundle. Mirrors
// apps/web/src/lib/event-radio/select.ts and window.ts; keep them in sync.

export type RadioSegment = { audioUrl: string; durationMs: number };

export type EventRadioBundle = {
  enabled: boolean;
  intro: RadioSegment | null;
  outro: RadioSegment | null;
  byEventId: Record<string, RadioSegment>;
};

export type RadioSegmentRow = {
  kind: 'intro' | 'event' | 'outro';
  scope_key: string;
  audio_url: string;
  duration_ms: number;
  created_at: string;
};

export const EMPTY_RADIO_BUNDLE: EventRadioBundle = {
  enabled: false,
  intro: null,
  outro: null,
  byEventId: {},
};

const DAY_MS = 86_400_000;

/** Device-local calendar date as YYYY-MM-DD (people in Röbel are in Europe/Berlin). */
export function localDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isoWeekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function pickLatestPerScope<T extends RadioSegmentRow>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.kind}:${row.scope_key}`;
    const current = out.get(key);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) {
      out.set(key, row);
    }
  }
  return out;
}

function toSegment(row: RadioSegmentRow | undefined): RadioSegment | null {
  return row ? { audioUrl: row.audio_url, durationMs: row.duration_ms } : null;
}

export function assembleRadioBundle(
  rows: RadioSegmentRow[],
  eventIds: string[],
  todayKey: string,
  weekKey: string,
): EventRadioBundle {
  const latest = pickLatestPerScope(rows);
  const byEventId: Record<string, RadioSegment> = {};
  for (const id of eventIds) {
    const seg = toSegment(latest.get(`event:${id}`));
    if (seg) byEventId[id] = seg;
  }
  return {
    enabled: true,
    intro: toSegment(latest.get(`intro:${todayKey}`)),
    outro: toSegment(latest.get(`outro:${weekKey}`)),
    byEventId,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/expo && pnpm exec jest lib/__tests__/event-radio-select.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/event-radio-select.ts apps/expo/lib/__tests__/event-radio-select.test.ts
git commit -m "feat(expo): event-radio bundle selection helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 15: Expo data access (`supabase-event-radio.ts`, settings, cache)

**Files:**
- Create: `apps/expo/lib/supabase-event-radio.ts`
- Modify: `apps/expo/lib/supabase-app-settings.ts` (append), `apps/expo/lib/story-cache.ts` (type)

**Interfaces:**
- Consumes: `supabase` from `./supabase`, helpers from Task 14, `fetchAppSetting` (module-private in supabase-app-settings.ts).
- Produces: `fetchEventRadioEnabled(): Promise<boolean>`, `fetchEventRadio(eventIds: string[]): Promise<EventRadioBundle>`, `CachedStories.radio?: EventRadioBundle`.

- [ ] **Step 1: Append to `supabase-app-settings.ts`**

```ts
/**
 * Kill switch for the Wochen-Radio narration in event stories. Missing key
 * counts as ENABLED; setting it to 'false' silences narration on every client
 * without an app update (the bed track keeps playing as before).
 */
export async function fetchEventRadioEnabled(): Promise<boolean> {
  const value = await fetchAppSetting('event_radio_enabled');
  return value !== 'false';
}
```

- [ ] **Step 2: Create `supabase-event-radio.ts`**

```ts
// apps/expo/lib/supabase-event-radio.ts
import { supabase } from './supabase';
import { fetchEventRadioEnabled } from './supabase-app-settings';
import {
  assembleRadioBundle,
  EMPTY_RADIO_BUNDLE,
  isoWeekKey,
  localDateKey,
  type EventRadioBundle,
  type RadioSegmentRow,
} from './event-radio-select';

export type { EventRadioBundle, RadioSegment } from './event-radio-select';

/**
 * Narration clips for the given events plus today's intro and this week's
 * outro. Returns the empty bundle (enabled: false) when the kill switch is
 * off, on any error, or when there is nothing to fetch.
 */
export async function fetchEventRadio(eventIds: string[]): Promise<EventRadioBundle> {
  if (eventIds.length === 0) return EMPTY_RADIO_BUNDLE;
  const enabled = await fetchEventRadioEnabled();
  if (!enabled) return EMPTY_RADIO_BUNDLE;

  const todayKey = localDateKey();
  const weekKey = isoWeekKey(todayKey);
  const idList = eventIds.map((id) => `"${id}"`).join(',');
  const { data, error } = await supabase
    .from('event_radio_segments')
    .select('kind, scope_key, audio_url, duration_ms, created_at')
    .or(
      `and(kind.eq.event,scope_key.in.(${idList})),and(kind.eq.intro,scope_key.eq.${todayKey}),and(kind.eq.outro,scope_key.eq.${weekKey})`,
    );
  if (error) {
    console.error('fetch event_radio_segments error:', error);
    return EMPTY_RADIO_BUNDLE;
  }
  return assembleRadioBundle((data ?? []) as RadioSegmentRow[], eventIds, todayKey, weekKey);
}
```

- [ ] **Step 3: Extend the cache type**

In `apps/expo/lib/story-cache.ts` add `import type { EventRadioBundle } from '@/lib/event-radio-select';` and the optional field:

```ts
export type CachedStories = {
  events: EventRecord[];
  collections: StoryCollection[];
  collectionSlides: Record<string, StorySlide[]>;
  audioUrl: string | null;
  // Wochen-Radio narration; absent in bundles saved before the feature shipped.
  radio?: EventRadioBundle;
  savedAt: number; // Date.now() at save time
};
```

- [ ] **Step 4: Typecheck touched files**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit 2>&1 | grep -E "supabase-event-radio|supabase-app-settings|story-cache|event-radio-select"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/supabase-event-radio.ts apps/expo/lib/supabase-app-settings.ts apps/expo/lib/story-cache.ts
git commit -m "feat(expo): fetch Wochen-Radio narration bundle with kill switch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 16: Narration queue and progress math (`story-narration.ts`)

**Files:**
- Create: `apps/expo/components/feed/story-narration.ts`
- Test: `apps/expo/components/feed/__tests__/story-narration.test.ts`

**Interfaces:**
- Consumes: `RadioSegment` (Task 14).
- Produces: constants `NARRATION_TAIL_MS = 900`, `BED_FULL = 1`, `BED_DUCK = 0.22`, `BED_FADE_IN_MS = 1200`, `BED_DUCK_MS = 350`, `BED_UNDUCK_MS = 700`, `BED_FADE_OUT_MS = 400`, `NARRATION_LOAD_TIMEOUT_MS = 4000`; type `NarrationClip = RadioSegment & { role: 'intro' | 'slide' | 'outro' }`; `buildNarrationQueue(input): NarrationClip[]`; `narrationProgress(queue, clipIndex, clipCurrentTimeSec): number`; `AUDIO_DISCLOSURE_LABEL = 'Mecky · KI-Stimme · Musik: Eleven Music'`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/expo/components/feed/__tests__/story-narration.test.ts
import {
  buildNarrationQueue,
  narrationProgress,
  NARRATION_TAIL_MS,
} from '@/components/feed/story-narration';

const clip = (url: string, durationMs = 10000) => ({ audioUrl: url, durationMs });

describe('buildNarrationQueue', () => {
  const base = {
    slide: clip('slide'),
    intro: clip('intro', 5000),
    outro: clip('outro', 3000),
    slideIndex: 0,
    slideCount: 3,
    openedAtSlideIndex: 0,
    introPlayed: false,
    outroPlayed: false,
  };

  it('plays intro then the slide when opened at the first event', () => {
    expect(buildNarrationQueue(base).map((c) => c.role)).toEqual(['intro', 'slide']);
  });

  it('skips the intro when opened in the middle', () => {
    const q = buildNarrationQueue({ ...base, slideIndex: 1, openedAtSlideIndex: 1 });
    expect(q.map((c) => c.role)).toEqual(['slide']);
  });

  it('skips the intro when returning to slide 0 after it played', () => {
    const q = buildNarrationQueue({ ...base, introPlayed: true });
    expect(q.map((c) => c.role)).toEqual(['slide']);
  });

  it('appends the outro on the last slide, once', () => {
    const last = { ...base, slideIndex: 2, openedAtSlideIndex: 2 };
    expect(buildNarrationQueue(last).map((c) => c.role)).toEqual(['slide', 'outro']);
    expect(buildNarrationQueue({ ...last, outroPlayed: true }).map((c) => c.role)).toEqual(['slide']);
  });

  it('single-slide group opened at 0 gets intro, slide, outro', () => {
    const q = buildNarrationQueue({ ...base, slideCount: 1 });
    expect(q.map((c) => c.role)).toEqual(['intro', 'slide', 'outro']);
  });

  it('returns an empty queue when the slide has no narration', () => {
    expect(buildNarrationQueue({ ...base, slide: null })).toEqual([]);
    // No intro either: an intro without a slide clip would be odd.
    expect(buildNarrationQueue({ ...base, slide: undefined, slideIndex: 0 })).toEqual([]);
  });
});

describe('narrationProgress', () => {
  const queue = [
    { audioUrl: 'a', durationMs: 4000, role: 'intro' as const },
    { audioUrl: 'b', durationMs: 6000, role: 'slide' as const },
  ];
  it('accumulates finished clips plus the current position over total + tail', () => {
    const total = 10000 + NARRATION_TAIL_MS;
    expect(narrationProgress(queue, 0, 2)).toBeCloseTo(2000 / total, 5);
    expect(narrationProgress(queue, 1, 3)).toBeCloseTo(7000 / total, 5);
  });
  it('clamps to [0, 1]', () => {
    expect(narrationProgress(queue, 1, 99)).toBe(1);
    expect(narrationProgress(queue, 0, -1)).toBe(0);
    expect(narrationProgress([], 0, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/expo && pnpm exec jest components/feed/__tests__/story-narration.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `story-narration.ts`**

```ts
// apps/expo/components/feed/story-narration.ts
// Pure helpers for the Wochen-Radio narration inside StoryViewer: which clips
// play on a slide, and how far along the slide is. No React, no expo-audio.
import type { RadioSegment } from '@/lib/event-radio-select';

export const NARRATION_TAIL_MS = 900; // breathing room after the last clip
export const BED_FULL = 1;
export const BED_DUCK = 0.22;
export const BED_FADE_IN_MS = 1200;
export const BED_DUCK_MS = 350;
export const BED_UNDUCK_MS = 700;
export const BED_FADE_OUT_MS = 400;
export const NARRATION_LOAD_TIMEOUT_MS = 4000;
export const AUDIO_DISCLOSURE_LABEL = 'Mecky · KI-Stimme · Musik: Eleven Music';

export type NarrationClip = RadioSegment & { role: 'intro' | 'slide' | 'outro' };

/**
 * Intro only when the viewer was opened at the first slide and has not played
 * it yet. Outro after the last slide's clip, once. A slide without its own
 * clip gets no narration at all (the timer runs instead).
 */
export function buildNarrationQueue(input: {
  slide: RadioSegment | null | undefined;
  intro?: RadioSegment | null;
  outro?: RadioSegment | null;
  slideIndex: number;
  slideCount: number;
  openedAtSlideIndex: number;
  introPlayed: boolean;
  outroPlayed: boolean;
}): NarrationClip[] {
  if (!input.slide) return [];
  const queue: NarrationClip[] = [];
  if (input.intro && input.slideIndex === 0 && input.openedAtSlideIndex === 0 && !input.introPlayed) {
    queue.push({ ...input.intro, role: 'intro' });
  }
  queue.push({ ...input.slide, role: 'slide' });
  if (input.outro && input.slideIndex === input.slideCount - 1 && !input.outroPlayed) {
    queue.push({ ...input.outro, role: 'outro' });
  }
  return queue;
}

/** 0..1 across the whole queue plus the tail, from the current clip's position in seconds. */
export function narrationProgress(
  queue: NarrationClip[],
  clipIndex: number,
  clipCurrentTimeSec: number,
): number {
  if (queue.length === 0) return 0;
  const total = queue.reduce((sum, c) => sum + c.durationMs, 0) + NARRATION_TAIL_MS;
  const before = queue.slice(0, clipIndex).reduce((sum, c) => sum + c.durationMs, 0);
  const current = Math.max(0, clipCurrentTimeSec) * 1000;
  return Math.max(0, Math.min(1, (before + current) / total));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/expo && pnpm exec jest components/feed/__tests__/story-narration.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/feed/story-narration.ts apps/expo/components/feed/__tests__/story-narration.test.ts
git commit -m "feat(expo): narration queue and progress math for story radio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 17: StoryViewer narration playback, ducking, timing, fade-out close

**Files:**
- Modify: `apps/expo/components/feed/StoryViewer.tsx` (shim lines 48-78, types lines 91-121, audio section lines 247-334, timer lines 336-357, navigation lines 359-404, gestures lines 441-449, Modal/close button/tooltip lines 516-521, 639-653, SongTooltip lines 748-786)

**Interfaces:**
- Consumes: `RadioSegment` (Task 14), everything from `story-narration.ts` (Task 16).
- Produces: `StorySlideInput.narration?: RadioSegment | null`, `StoryGroup.introNarration?: RadioSegment | null`, `StoryGroup.outroNarration?: RadioSegment | null`. `audioLinkUrl` stays optional; the tooltip is only pressable when it is set.

- [ ] **Step 1: Extend the expo-audio shim** (replace lines 55-78)

```ts
type StoryAudioPlayer = {
  play: () => void;
  pause: () => void;
  muted: boolean;
  loop: boolean;
  volume: number;
} | null;
type StoryAudioStatus = {
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  didJustFinish?: boolean;
  isLoaded?: boolean;
};
type UseAudioPlayerFn = (
  source: string | null,
  options?: { updateInterval?: number },
) => StoryAudioPlayer;
type UseAudioPlayerStatusFn = (player: StoryAudioPlayer) => StoryAudioStatus;
type SetAudioModeFn = (mode: Record<string, unknown>) => Promise<void>;
type PreloadFn = (source: { uri: string }) => Promise<void>;

let useAudioPlayer: UseAudioPlayerFn = () => null;
let useAudioPlayerStatus: UseAudioPlayerStatusFn = () => ({});
let setAudioModeAsync: SetAudioModeFn = async () => {};
let preloadAudio: PreloadFn = async () => {};
// True only when the real native module loaded; narration needs status events.
let audioModuleAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-audio');
  if (mod?.useAudioPlayer) {
    useAudioPlayer = mod.useAudioPlayer as UseAudioPlayerFn;
    audioModuleAvailable = true;
    console.log('[StoryViewer] expo-audio loaded ✓');
  }
  if (mod?.useAudioPlayerStatus) useAudioPlayerStatus = mod.useAudioPlayerStatus as UseAudioPlayerStatusFn;
  if (mod?.setAudioModeAsync) setAudioModeAsync = mod.setAudioModeAsync as SetAudioModeFn;
  if (mod?.preload) preloadAudio = mod.preload as PreloadFn;
} catch (err) {
  console.warn(
    '[StoryViewer] expo-audio native module unavailable — audio disabled. ' +
      'Run `eas build` to ship a binary that includes it.',
    err,
  );
}
```

Add the imports near the top of the file:

```ts
import type { RadioSegment } from '@/lib/event-radio-select';
import {
  BED_DUCK,
  BED_DUCK_MS,
  BED_FADE_IN_MS,
  BED_FADE_OUT_MS,
  BED_FULL,
  BED_UNDUCK_MS,
  buildNarrationQueue,
  NARRATION_LOAD_TIMEOUT_MS,
  NARRATION_TAIL_MS,
  narrationProgress,
  type NarrationClip,
} from './story-narration';
```

- [ ] **Step 2: Extend the types**

In `StorySlideInput` add after `audioUrl?: string | null;`:

```ts
  // Wochen-Radio: Mecky's narration clip for this slide. When set, the clip
  // drives the slide's timing and ducks the bed track while it speaks.
  narration?: RadioSegment | null;
```

In `StoryGroup` add after `durationMs?: number;`:

```ts
  // Wochen-Radio: intro plays once when the viewer opens at this group's first
  // slide; outro plays once after the last slide's clip.
  introNarration?: RadioSegment | null;
  outroNarration?: RadioSegment | null;
```

- [ ] **Step 3: Narration state, players, and effects** (insert after the `currentIsVideo` block, before the existing "Audio playback (two-player crossfade)" section, then adapt that section)

```ts
  // ── Wochen-Radio narration ─────────────────────────────────
  // One clip queue per slide (intro? + slide + outro?), played on a third
  // player. While a clip speaks, the bed ducks; when the queue ends the slide
  // advances after a short tail. Anything failing falls back to the timer.
  const openedAtSlideIndexRef = useRef(initialSlideIndex);
  const introPlayedRef = useRef(false);
  const outroPlayedRef = useRef(false);
  const closingRef = useRef(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [narrationFailed, setNarrationFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    openedAtSlideIndexRef.current = initialSlideIndex;
    introPlayedRef.current = false;
    outroPlayedRef.current = false;
    closingRef.current = false;
    setClipIndex(0);
    setNarrationFailed(false);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialGroupIndex, initialSlideIndex]);

  const currentSlide = currentGroup?.slides[currentSlideIndex];
  const narrationQueue: NarrationClip[] =
    audioModuleAvailable && currentGroup && !currentIsVideo
      ? buildNarrationQueue({
          slide: currentSlide?.narration,
          intro: currentGroup.introNarration,
          outro: currentGroup.outroNarration,
          slideIndex: currentSlideIndex,
          slideCount: currentGroup.slides.length,
          openedAtSlideIndex: openedAtSlideIndexRef.current,
          introPlayed: introPlayedRef.current,
          outroPlayed: outroPlayedRef.current,
        })
      : [];
  const narrationActive = narrationQueue.length > 0 && !narrationFailed;
  const currentClip = narrationActive ? narrationQueue[Math.min(clipIndex, narrationQueue.length - 1)] : null;
  const narrationUrl = currentClip?.audioUrl ?? null;
  const narrationPlayer = useAudioPlayer(narrationUrl, { updateInterval: 250 });
  const narrationStatus = useAudioPlayerStatus(narrationPlayer);
  const narrationSpeaking = narrationActive && narrationStatus.playing === true;

  // New slide → restart the queue.
  useEffect(() => {
    setClipIndex(0);
    setNarrationFailed(false);
  }, [currentGroupIndex, currentSlideIndex]);

  // Load timeout → this slide falls back to the timer.
  useEffect(() => {
    if (!narrationUrl) return;
    if (narrationStatus.isLoaded) return;
    const t = setTimeout(() => setNarrationFailed(true), NARRATION_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [narrationUrl, narrationStatus.isLoaded]);

  // Clip finished → next clip, or advance the slide after the tail.
  const finishedClipRef = useRef<string | null>(null);
  useEffect(() => {
    if (!narrationActive || !currentClip || !narrationStatus.didJustFinish) return;
    const key = `${currentGroupIndex}:${currentSlideIndex}:${clipIndex}`;
    if (finishedClipRef.current === key) return;
    finishedClipRef.current = key;
    if (currentClip.role === 'intro') introPlayedRef.current = true;
    if (currentClip.role === 'outro') outroPlayedRef.current = true;
    if (clipIndex < narrationQueue.length - 1) {
      setClipIndex(clipIndex + 1);
      return;
    }
    const t = setTimeout(() => stepForwardJS(), NARRATION_TAIL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationStatus.didJustFinish, narrationActive, currentClip, clipIndex, narrationQueue.length]);

  // Drive the progress bar from narration position.
  useEffect(() => {
    if (!narrationActive) return;
    progress.setValue(narrationProgress(narrationQueue, clipIndex, narrationStatus.currentTime ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationActive, narrationStatus.currentTime, clipIndex]);

  // Preload the next slide's clip so it starts without a gap.
  useEffect(() => {
    const next = currentGroup?.slides[currentSlideIndex + 1]?.narration?.audioUrl;
    if (next) preloadAudio({ uri: next }).catch(() => {});
  }, [currentGroup, currentSlideIndex]);
```

Note: `progress` and `stepForwardJS` are declared later in the current file. Move the line `const progress = useRef(new RNAnimated.Value(0)).current;` up to just below the React state block (after `const dragY = useSharedValue(0);`), and move the whole `stepForwardJS` / `stepBackJS` `useCallback` definitions up to directly after the `currentIsVideo` block so the narration effects can reference them. Effects that use `stepForwardJS` must come after its definition.

- [ ] **Step 4: Adapt the existing player effects**

Replace the `apply` effect (the one that sets `loop`, `muted`, play/pause) so it also handles the narration player:

```ts
  useEffect(() => {
    const apply = (p: StoryAudioPlayer, url: string | null, loop: boolean) => {
      if (!p) return;
      try {
        p.loop = loop;
        p.muted = muted;
        if (visible && !paused && url && !currentIsVideo && !closingRef.current) p.play();
        else p.pause();
      } catch (err) {
        console.warn('StoryViewer audio control failed:', err);
      }
    };
    apply(groupPlayer, groupAudioUrl, true);
    apply(slidePlayer, slideOverrideUrl, true);
    apply(narrationPlayer, narrationActive ? narrationUrl : null, false);
    return () => {
      for (const p of [groupPlayer, slidePlayer, narrationPlayer]) {
        try {
          p?.pause();
        } catch {
          /* noop */
        }
      }
    };
  }, [
    groupPlayer,
    slidePlayer,
    narrationPlayer,
    groupAudioUrl,
    slideOverrideUrl,
    narrationUrl,
    narrationActive,
    visible,
    paused,
    muted,
    currentIsVideo,
  ]);
```

Replace the crossfade effect with the ducking version:

```ts
  // Bed level: full between clips, ducked while Mecky speaks. The override
  // track (a slide's own audioUrl) takes the bed's place and is ducked the
  // same way; the group bed sits at 0 underneath so it resumes seamlessly.
  const fadeRef = useRef<number | null>(null);
  const bedLevel = narrationSpeaking ? BED_DUCK : BED_FULL;
  useEffect(() => {
    if (closingRef.current) return;
    const overrideActive = Boolean(slideOverrideUrl);
    if (overrideActive && slidePlayer) {
      try {
        slidePlayer.volume = 0;
      } catch {
        /* noop */
      }
    }
    fadeVolume(
      fadeRef,
      [
        { player: groupPlayer, to: overrideActive ? 0 : bedLevel },
        { player: slidePlayer, to: overrideActive ? bedLevel : 0 },
      ],
      narrationSpeaking ? BED_DUCK_MS : BED_UNDUCK_MS,
    );
    return () => {
      if (fadeRef.current != null) {
        cancelAnimationFrame(fadeRef.current);
        fadeRef.current = null;
      }
    };
  }, [groupPlayer, slidePlayer, slideOverrideUrl, bedLevel, narrationSpeaking]);

  // Fade the bed in from silence when the viewer opens.
  useEffect(() => {
    if (!visible || !groupPlayer) return;
    try {
      groupPlayer.volume = 0;
    } catch {
      /* noop */
    }
    fadeVolume(fadeRef, [{ player: groupPlayer, to: BED_FULL }], BED_FADE_IN_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, groupPlayer]);
```

Replace the auto-advance timer effect's early return so narrated slides skip the timer:

```ts
    if (currentIsVideo || narrationActive) return;
```

and add `narrationActive` to that effect's dependency array.

- [ ] **Step 5: `requestClose` with fade-out**

Add after `stepBackJS`:

```ts
  // Every way out (close button, swipe-down, end of the last group, Android
  // back) runs through here so the bed and voice fade instead of cutting.
  const requestClose = useCallback(() => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    fadeVolume(
      fadeRef,
      [
        { player: groupPlayer, to: 0 },
        { player: slidePlayer, to: 0 },
        { player: narrationPlayer, to: 0 },
      ],
      BED_FADE_OUT_MS,
    );
    setTimeout(onClose, BED_FADE_OUT_MS);
  }, [groupPlayer, slidePlayer, narrationPlayer, onClose]);
```

`fadeRef` must be declared before `requestClose`; keep the `const fadeRef = useRef<number | null>(null);` line above both. Then:

- In `stepForwardJS`, replace `onClose();` (the "end of last group" branch) with `requestClose();` and add `requestClose` to its dependency array (declare `requestClose` before `stepForwardJS`, or give `stepForwardJS` a ref to it: `const requestCloseRef = useRef(requestClose); requestCloseRef.current = requestClose;` and call `requestCloseRef.current()`).
- In the pan gesture's swipe-down branch, replace `runOnJS(onClose)()` inside the `withTiming` callback with `runOnJS(requestClose)()`.
- `<Modal onRequestClose={requestClose}>` and the close `Pressable onPress={requestClose}`.

- [ ] **Step 6: Tooltip only pressable with a link**

In the `SongTooltip` usage pass `onPress` only when there is a link, and make the component accept `onPress?: () => void`:

```tsx
                  <SongTooltip
                    title={currentGroup.audioTitle}
                    onPress={
                      currentGroup.audioLinkUrl
                        ? () => Linking.openURL(currentGroup.audioLinkUrl!).catch(() => {})
                        : undefined
                    }
                  />
```

and in `SongTooltip`: `onPress?: () => void`, `<Pressable onPress={onPress} disabled={!onPress} ...>`.

- [ ] **Step 7: Typecheck, lint, and existing tests**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit 2>&1 | grep -E "StoryViewer|story-narration"`
Expected: no output.
Run: `cd apps/expo && pnpm exec eslint components/feed/StoryViewer.tsx`
Expected: no new errors beyond the file's pre-existing ones (compare with `git stash; pnpm exec eslint components/feed/StoryViewer.tsx; git stash pop` if unsure).
Run: `cd apps/expo && pnpm exec jest components/feed lib/__tests__/event-radio-select.test.ts`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/expo/components/feed/StoryViewer.tsx
git commit -m "feat(expo): StoryViewer narration player with bed ducking, fades and clip-driven timing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 18: HomeStoryBar wiring

**Files:**
- Modify: `apps/expo/components/feed/HomeStoryBar.tsx` (imports lines 14-27, module cache lines 56-64, effect lines 117-204, groups lines 214-263)

**Interfaces:**
- Consumes: `fetchEventRadio`, `EventRadioBundle` (Task 15), `EMPTY_RADIO_BUNDLE` (Task 14), `AUDIO_DISCLOSURE_LABEL` (Task 16), the new `StorySlideInput.narration` / `StoryGroup.introNarration` / `outroNarration` (Task 17).

- [ ] **Step 1: Imports and module cache**

```ts
import { fetchEventRadio, type EventRadioBundle } from '@/lib/supabase-event-radio';
import { EMPTY_RADIO_BUNDLE } from '@/lib/event-radio-select';
import { AUDIO_DISCLOSURE_LABEL } from './story-narration';
```

Add to the module cache block: `let cachedRadio: EventRadioBundle = EMPTY_RADIO_BUNDLE;`

- [ ] **Step 2: State and loading**

Add state: `const [radio, setRadio] = useState<EventRadioBundle>(cachedRadio);`

In the cold-start hydration block (inside `loadCachedStories().then(...)`) add: `if (bundle.radio) setRadio((prev) => (prev.enabled ? prev : bundle.radio!));`

Replace the `eventsP` promise so narration loads right after the events:

```ts
    let freshRadio: EventRadioBundle = cachedRadio;
    const eventsP = fetchThisWeekEvents().then(async (data) => {
      if (cancelled) return;
      freshEvents = data as EventRecord[];
      cachedEvents = freshEvents;
      setEvents(freshEvents);
      const bundle = await fetchEventRadio(freshEvents.map((e) => e.id));
      if (cancelled) return;
      freshRadio = bundle;
      cachedRadio = bundle;
      setRadio(bundle);
    });
```

and include `radio: freshRadio` in the `saveCachedStories({...})` call.

- [ ] **Step 3: Pass narration into the groups**

In the `eventSlides` map add after `audioUrl: event.audio_url ?? null,`:

```ts
          narration: radio.enabled ? (radio.byEventId[event.id] ?? null) : null,
```

In the events group object:

```ts
      const hasNarration = radio.enabled && Object.keys(radio.byEventId).length > 0;
      result.push({
        id: 'events',
        audioUrl: eventStoriesAudioUrl,
        // With Mecky narrating, the tooltip becomes the AI disclosure. Without
        // narration (kill switch, or nothing generated yet) it stays the song.
        audioTitle: hasNarration ? AUDIO_DISCLOSURE_LABEL : EVENT_STORIES_SONG_TITLE,
        audioLinkUrl: hasNarration ? null : EVENT_STORIES_SONG_URL,
        introNarration: radio.enabled ? radio.intro : null,
        outroNarration: radio.enabled ? radio.outro : null,
        durationMs: 10000,
        slides: eventSlides,
      });
```

Add `radio` to the `useMemo` dependency array.

- [ ] **Step 4: Typecheck and lint**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit 2>&1 | grep -E "HomeStoryBar|StoryViewer|event-radio"`
Expected: no output.
Run: `cd apps/expo && pnpm exec eslint components/feed/HomeStoryBar.tsx`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/feed/HomeStoryBar.tsx
git commit -m "feat(expo): feed event stories carry Wochen-Radio narration and AI disclosure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 19: End-to-end verification and handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-event-story-radio-show-design.md` only if a deviation was needed during implementation (record it in a short "Implementation notes" section at the end).

- [ ] **Step 1: Web dry run with real data** (needs `ANTHROPIC_API_KEY` and a voice id; `ELEVENLABS_API_KEY` may be a placeholder for the dry run)

Set `event_radio_voice_id` to any non-empty value through the panel, run `cd apps/web && pnpm dev`, open the events dashboard, press "Skripte prüfen". Expected: a dialog with an intro, one script per approved event this week, and an outro; scripts contain no digits, no dashes, and every event is named in its first sentence. Read them out loud once: they should each stand alone.

- [ ] **Step 2: Voice and bed setup** (Max, with the real key)

```bash
cd apps/web
node --env-file=.env.local scripts/event-radio-setup.mjs voice-preview --out ../../output/event-radio
# listen, pick one
node --env-file=.env.local scripts/event-radio-setup.mjs voice-create --generated-voice-id <id> --name Mecky
node --env-file=.env.local scripts/event-radio-setup.mjs bed --seconds 90 --out ../../output/event-radio --upload
```

Paste the voice id into the panel, press "Jetzt neu generieren". Expected: the panel lists every event as "Aktuell" with a playable clip, plus intro and outro. Check the ElevenLabs dashboard for the request count (about one per scope).

- [ ] **Step 3: Vercel env and cron**

Add `ELEVENLABS_API_KEY` to the Vercel project (Production). After deploy, trigger once: `curl -H "Authorization: Bearer $CRON_SECRET" https://roebel.app/api/cron/event-radio`. Expected: JSON with `reused` listing every scope and empty `generated`.

- [ ] **Step 4: Expo emulator checklist** (repacked channel APK first, as the OTA rule requires)

- Open the first event: bed fades in, intro plays, then the event clip; the progress bar follows the voice; the slide advances about a second after the clip ends.
- Open a middle event: no intro, that event's clip starts immediately, bed ducked underneath.
- Tap forward through to the last event: outro plays after its clip, then the viewer fades out and closes.
- Long-press: voice and bed pause; release: both resume.
- Mute: silence, timing unchanged; unmute mid-clip: voice continues.
- Swipe down and the close button: audio fades over about half a second, no cut.
- An event without a clip (temporarily delete its row): the 10 s timer runs, bed at full.
- Set `event_radio_enabled` to `false`: behaviour identical to before the feature.
- Old binary (build without expo-audio, or force `audioModuleAvailable = false` locally): timer, no crash.

- [ ] **Step 5: Handoff**

Report to Max: what was verified on which device, the credit count the first full run consumed, and that the OTA is his to ship. Update the project memory file with the shipped state.
