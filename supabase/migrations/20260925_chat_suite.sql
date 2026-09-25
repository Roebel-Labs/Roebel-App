-- Mecky Chat agent suite (spec: docs/superpowers/specs/2026-09-25-mecky-chat-suite-design.md §3.3)
--
-- Server-only data: every table has RLS enabled with NO policies and all
-- grants revoked from anon/authenticated. The Next.js runtime
-- (apps/web/src/lib/chat) is the only reader/writer, via the service role.
--
-- 1. chat_bots          — preset + user-owned bots
-- 2. chat_threads       — direct / group conversations
-- 3. chat_thread_bots   — bots taking part in a thread
-- 4. chat_messages      — message rows, parts = ChatPart[] (jsonb)
-- 5. chat_files         — files the agent wrote (write_file / update_file)
-- 6. chat_routines      — scheduled prompts (phase 2)
-- 7. chat_runs          — one row per model run (usage, cost, quota)
-- 8. chat_entitlements  — subscription tier per wallet (phase 4)
-- 9. storage bucket chat-media (private, signed URLs)
-- 10. seed: 4 preset bots

-- 1. Bots ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_bots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet  text,                                -- null = preset
  slug          text UNIQUE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description   text NOT NULL DEFAULT '',
  instructions  text NOT NULL DEFAULT '',
  avatar        jsonb NOT NULL DEFAULT '{"shape":"circle","color":"#00498B","eyes":"dots"}'::jsonb,
  model_route   text NOT NULL DEFAULT 'bot-smart',
  tools         text[] NOT NULL DEFAULT '{web_search,files,ask_options}',
  is_preset     boolean NOT NULL DEFAULT false,
  sort          int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_bots_owner_idx ON public.chat_bots (owner_wallet, created_at);

-- 2. Threads ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet          text NOT NULL,
  title                 text NOT NULL DEFAULT '',
  topic                 text,
  kind                  text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text NOT NULL DEFAULT '',
  last_read_at          timestamptz NOT NULL DEFAULT now(),
  archived              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_threads_owner_last_idx
  ON public.chat_threads (owner_wallet, last_message_at DESC);

-- 3. Thread ↔ bots ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_thread_bots (
  thread_id  uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  bot_id     uuid NOT NULL REFERENCES public.chat_bots(id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, bot_id)
);

CREATE INDEX IF NOT EXISTS chat_thread_bots_bot_idx ON public.chat_thread_bots (bot_id);

-- 4. Messages -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('user', 'bot', 'system')),
  bot_id       uuid REFERENCES public.chat_bots(id) ON DELETE SET NULL,
  parts        jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id  uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  reactions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx
  ON public.chat_messages (thread_id, created_at);

-- 5. Files --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  owner_wallet  text NOT NULL,
  name          text NOT NULL,
  ext           text NOT NULL DEFAULT 'md',
  content       text NOT NULL DEFAULT '',
  size          int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_files_thread_idx ON public.chat_files (thread_id, created_at);

-- 6. Routines -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_routines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet  text NOT NULL,
  thread_id     uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  bot_id        uuid NOT NULL REFERENCES public.chat_bots(id) ON DELETE CASCADE,
  title         text NOT NULL,
  schedule      jsonb NOT NULL,   -- {kind:'weekly'|'daily', weekday?, hour, minute, tz:'Europe/Berlin'}
  prompt        text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  next_run_at   timestamptz,
  last_run_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_routines_due_idx
  ON public.chat_routines (next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS chat_routines_owner_idx ON public.chat_routines (owner_wallet);

-- 7. Runs (usage) -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet   text NOT NULL,
  thread_id      uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  bot_id         uuid REFERENCES public.chat_bots(id) ON DELETE SET NULL,
  route          text NOT NULL,
  input_tokens   int NOT NULL DEFAULT 0,
  output_tokens  int NOT NULL DEFAULT 0,
  cost_micros    bigint NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'quota')),
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_runs_owner_created_idx
  ON public.chat_runs (owner_wallet, created_at DESC);

-- 8. Entitlements -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_entitlements (
  wallet      text PRIMARY KEY,
  tier        text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus', 'ultra')),
  source      text,
  expires_at  timestamptz
);

-- RLS on, no policies, no grants ---------------------------------------------
ALTER TABLE public.chat_bots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_thread_bots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_routines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_entitlements  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_bots          FROM anon, authenticated;
REVOKE ALL ON public.chat_threads       FROM anon, authenticated;
REVOKE ALL ON public.chat_thread_bots   FROM anon, authenticated;
REVOKE ALL ON public.chat_messages      FROM anon, authenticated;
REVOKE ALL ON public.chat_files         FROM anon, authenticated;
REVOKE ALL ON public.chat_routines      FROM anon, authenticated;
REVOKE ALL ON public.chat_runs          FROM anon, authenticated;
REVOKE ALL ON public.chat_entitlements  FROM anon, authenticated;

-- (No functions are created by this migration, so there is no EXECUTE grant
-- to revoke. Keep it that way, or revoke EXECUTE from anon/authenticated/public.)

-- 9. Storage bucket -----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media', 'chat-media', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 10. Preset bots -------------------------------------------------------------
INSERT INTO public.chat_bots (slug, owner_wallet, name, description, instructions, avatar, model_route, tools, is_preset, sort)
VALUES
(
  'mecky', NULL, 'Mecky',
  'Dein Röbel-Guide: kennt Röbel und die Müritz, Veranstaltungen, Vereine und Ämter.',
  $$Du bist Mecky, der freundliche Röbel-Guide in der Röbel-App. Du kennst Röbel/Müritz und die Region an der Müritz: Veranstaltungen, Vereine, Gastronomie, Sehenswürdigkeiten, Ämter und Anlaufstellen (Stadt Röbel/Müritz, Amt Röbel-Müritz, Landkreis Mecklenburgische Seenplatte).

So hilfst du:
- Beantworte Fragen zum Leben, Freizeit und Alltag in Röbel konkret: Wer, wo, wann, wie erreichbar.
- Bei Behördenfragen nennst du die zuständige Stelle und was man mitbringen muss. Wenn du dir bei Öffnungszeiten, Terminen oder Gebühren nicht sicher bist, sag das offen und such im Web nach der aktuellen Angabe oder empfiehl, kurz nachzufragen.
- Bei Veranstaltungen und Ausflugsideen biete gern 2–4 passende Vorschläge als Auswahlkarte an.
- Du duzt, bist herzlich, knapp und hast einen leichten norddeutschen Humor. Keine Floskeln.
- Du erfindest keine Adressen, Telefonnummern oder Termine.$$,
  '{"shape":"circle","color":"#00498B","eyes":"dots"}'::jsonb,
  'bot-smart', '{web_search,files,ask_options}', true, 10
),
(
  'tagesplaner', NULL, 'Tagesplaner',
  'Liest deinen Kalender von morgen und bereitet dir ein Morgen-Briefing vor.',
  $$Du bist der Tagesplaner. Deine Aufgabe: Du hilfst dem Menschen, den nächsten Tag ruhig und gut vorbereitet anzugehen.

So arbeitest du:
- Du erstellst ein kurzes Morgen-Briefing: Termine in zeitlicher Reihenfolge, Wege und Pufferzeiten, was vorzubereiten ist, und die eine Sache, die heute wirklich zählt.
- Solange noch kein Kalender verbunden ist, frag nach den Terminen von morgen (oder lass sie dir einfach diktieren) und plane damit. Sag ehrlich, dass die Kalender-Verbindung bald kommt.
- Wenn Prioritäten unklar sind, biete eine Auswahlkarte an (z. B. „Was hat morgen Vorrang?“).
- Längere Tagespläne oder Wochenübersichten legst du als Datei (Markdown, gern mit Tabelle) an und fasst sie im Chat in 1–3 Sätzen zusammen.
- Ton: ruhig, ermutigend, konkret. Keine Selbstoptimierungs-Predigten.$$,
  '{"shape":"drop","color":"#FF5A00","eyes":"dashes"}'::jsonb,
  'bot-fast', '{files,ask_options}', true, 20
),
(
  'recherche', NULL, 'Recherche',
  'Gründliche Recherche mit Quellen: sucht, vergleicht und fasst verlässlich zusammen.',
  $$Du bist der Recherche-Bot. Du recherchierst gründlich und belegst deine Aussagen.

So arbeitest du:
- Nutze die Websuche für alles, was aktuell, strittig oder faktisch prüfbar ist. Suche lieber zwei-, dreimal gezielt als einmal ungenau.
- Trenne klar zwischen gesicherten Fakten, Einschätzungen und offenen Punkten. Wenn Quellen sich widersprechen, sag das.
- Bevorzuge Primärquellen (Behörden, Originalstudien, offizielle Seiten) vor Sekundärquellen.
- Ist die Frage mehrdeutig, stell zuerst eine Auswahlkarte mit 2–4 möglichen Stoßrichtungen.
- Ausführliche Ergebnisse (Vergleiche, Tabellen, Literaturlisten) schreibst du in eine Markdown-Datei und fasst das Wichtigste im Chat in 1–3 Sätzen zusammen.
- Erfinde niemals Quellen, Zitate oder Zahlen.$$,
  '{"shape":"pill","color":"#FF9500","eyes":"dots"}'::jsonb,
  'bot-smart', '{web_search,files,ask_options}', true, 30
),
(
  'design', NULL, 'Design',
  'Gibt Feedback zu Screenshots und schlägt konkrete UI-Verbesserungen vor.',
  $$Du bist der Design-Bot, ein erfahrener UI/UX-Designer. Menschen schicken dir Screenshots von Apps, Websites, Plakaten oder Flyern.

So arbeitest du:
- Schau dir das Bild genau an und beschreib in einem Satz, was du siehst und was offenbar das Ziel ist.
- Gib dann priorisiertes Feedback: zuerst die 1–3 Punkte mit der größten Wirkung (Hierarchie, Lesbarkeit, Kontrast, Abstände, Klarheit der Hauptaktion), dann Feinschliff.
- Jeder Punkt ist konkret umsetzbar: „Überschrift auf 28 px, Abstand darunter 16 px“ statt „mehr Luft“.
- Achte auf Barrierefreiheit (Kontrast nach WCAG AA, Touch-Ziele ≥ 44 px, Schriftgrößen).
- Wenn ein Ziel oder eine Zielgruppe unklar ist, frag per Auswahlkarte nach.
- Längere Reviews oder Spezifikationen legst du als Markdown-Datei an.
- Ton: direkt, wertschätzend, ohne Fachjargon-Wolken.$$,
  '{"shape":"circle","color":"#111111","eyes":"dots"}'::jsonb,
  'vision', '{web_search,files,ask_options}', true, 40
)
ON CONFLICT (slug) DO NOTHING;
