# Ortis agent harness (design)

Date: 2026-09-26 · Status: APPROVED by Max · Builds on: `2026-09-25-mecky-chat-suite-design.md`

## 1. Intent

Give the Mecky Chat agents everything they need to do real work in the Ortis environment — the
community's knowledge, the user's own context, actions in the app, the web and outside connectors
— with a policy that lets them run autonomously where it is safe and asks for approval where it
matters. Röbel is **tenant #1**; every tool is tenant-scoped so the next town reuses the harness.

Decisions (Max, 2026-09-26): scope = Röbel app as tenant #1, Ortis-ready · autonomy = act freely,
approve risky (public / money / external) · execution = durable jobs in our runtime now, microVM
later · connectors = web search+fetch, user-added MCP servers, Google (Gmail/Calendar/Drive) OAuth,
email via Resend.

**Queued next (after the harness, Max 2026-09-26):** field research + strategic theses + problem
analysis per audience (citizen, restaurant, Verein, business, Kommune) → an **inspiration screen**
in the chat suite with concrete agent-recommended tasks that solve real problems, create value,
can earn money and do good — the reason people subscribe and earn/benefit more than it costs.

## 2. Architecture

```
apps/web/src/lib/chat/harness/
  types.ts        HarnessTool, HarnessContext, Risk, TenantConfig          (contract §3)
  registry.ts     registerTool / toolsFor → ai ToolSet (policy-wrapped)
  policy.ts       risk → run | approval; grants; spend cap; kill switch
  audit.ts        agent_actions writes
  context.ts      system-context builder (user, tenant, memory, time, files)
  tenants.ts      TenantConfig for 'roebel'
  memory.ts       remember / recall / forget tools + store
  packs/
    roebel-read.ts   community knowledge (uses lib/roebel-data)
    user-private.ts  the user's own data
    web.ts           fetch_url (+ web_search stays the Anthropic server tool)
    actions.ts       public actions (wave 2)
    money.ts         Münzen transfer via device signing (wave 2)
    connectors.ts    user MCP servers + Google (wave 2)
    tasks.ts         start_task / ask_bot (wave 2)
apps/web/src/lib/roebel-data/   query functions extracted from app/api/roebel/[transport]/route.ts
                                (the public MCP keeps working, now importing these)
```

`runtime.ts` stops hand-building tools: it calls `toolsFor(...)`. Existing tools (ask_options,
write_file, update_file, calendar, routines) are registered as `private` tools unchanged in behaviour.

## 3. Contract

```ts
export type Risk = 'read' | 'private' | 'public' | 'money' | 'external';

export interface TenantConfig {
  id: string;                 // 'roebel'
  name: string;               // 'Röbel/Müritz'
  region: string;             // 'Mecklenburgische Seenplatte'
  timezone: string;           // 'Europe/Berlin'
  locale: 'de';
  appOrigin: string;          // 'https://www.roebel.app'
  facts: string[];            // short grounding facts for the system prompt
}

export interface HarnessContext {
  tenant: TenantConfig;
  wallet: string;             // lower-case; NEVER shown to the model as identity text
  profile: { displayName: string | null; username: string | null; isCitizen: boolean;
             orgs: { id: string; name: string; role: string; kind: string }[] } | null;
  threadId: string;
  botId: string;
  taskId: string | null;
  emitPart(part: ChatPart): void;   // attach a part to the current bot message
}

export interface HarnessTool<I = any> {
  name: string;               // snake_case, unique
  pack: 'roebel' | 'user' | 'web' | 'memory' | 'chat' | 'actions' | 'money' | 'connectors' | 'tasks';
  risk: Risk;
  description: string;        // German, for the model
  inputSchema: z.ZodType<I>;
  /** German one-liner for approval cards + audit ("Beitrag im Röbel-Feed veröffentlichen"). */
  summarize(input: I, ctx: HarnessContext): string;
  /** Rich preview for the approval card (gated tools). */
  preview?(input: I, ctx: HarnessContext): Promise<ApprovalPreview> | ApprovalPreview;
  execute(input: I, ctx: HarnessContext): Promise<unknown>;
  /** Tool is only offered when this returns true (e.g. user owns an org). */
  available?(ctx: HarnessContext): boolean;
}

export interface ApprovalPreview {
  kind: 'text' | 'post' | 'event' | 'listing' | 'message' | 'email' | 'transfer' | 'generic';
  fields: { label: string; value: string }[];
  body?: string;              // main text (post body, email body)
  imageUrl?: string;
}
```

New ChatParts (both `types.ts` contract blocks, identical):

```ts
| { type: 'approval'; actionId: string; tool: string; risk: 'public' | 'money' | 'external';
    title: string; summary: string; preview: ApprovalPreview;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired';
    resultNote?: string; canAlwaysAllow: boolean;
    signRequest?: { kind: 'muenzen_transfer'; toName: string; amount: string } }   // money only
| { type: 'task'; taskId: string; title: string;
    status: 'queued' | 'running' | 'waiting_approval' | 'done' | 'failed' | 'cancelled';
    steps: { label: string; status: 'pending' | 'running' | 'done' | 'failed' }[] }
```

### 3.1 Policy
- `read`, `private` → execute immediately, audit row `status='executed'`.
- `public`, `external` → if the user granted "immer erlauben" for (bot, tool) → execute; else
  create `agent_actions` row `pending` (input stored), `emitPart(approval)`, return to the model
  `{ status: 'awaiting_approval', actionId }` + instruction to stop and wait.
- `money` → always approval, never grantable; executed on the device (smart-wallet signature).
- Daily cap per wallet: 20 gated executions; kill switch `app_settings.agent_actions_enabled`
  ('false' → gated tools unavailable) and per-user pause (`agent_prefs.paused`).

### 3.2 HTTP (Bearer chat session, German errors)

| method + path | body | returns |
|---|---|---|
| POST `/api/chat/actions/:id/approve` | `{ alwaysAllow?: boolean }` | **SSE** (same events as messages send): executes the action, updates the approval part, then the bot continues its turn with the result |
| POST `/api/chat/actions/:id/reject` | `{ reason?: string }` | **SSE**: bot acknowledges briefly |
| POST `/api/chat/actions/:id/complete` | `{ txHash?: string; error?: string }` | money: device reports the signed result → SSE continuation |
| GET `/api/chat/memory` · DELETE `/api/chat/memory/:id` | – | `{ memories: {id, botId, fact, createdAt}[] }` |
| GET/PUT `/api/chat/bots/:id/grants` | `{ tools: string[] }` | always-allowed gated tools for this bot |
| GET `/api/chat/actions?limit=50` | – | audit list for the user |
| GET/POST/DELETE `/api/chat/connectors` | `{ kind:'mcp', name, url, headers? }` | wave 2 |
| GET `/api/chat/tasks/:id` · POST `/api/chat/tasks/:id/cancel` | – | wave 2 |
| GET `/api/chat/cron/tasks` | CRON_SECRET | wave 2 worker tick |

### 3.3 Data (`supabase/migrations/20260926_agent_harness.sql`, RLS on, no grants to anon/authenticated)
- `agent_actions` — id, wallet, thread_id, message_id, bot_id, task_id, tool, risk, input jsonb,
  summary, status, result jsonb, error, created_at, decided_at, executed_at.
- `agent_grants` — wallet, bot_id, tool, created_at, pk(wallet, bot_id, tool).
- `agent_memory` — id, wallet, bot_id null, fact text (≤ 500), created_at.
- `agent_prefs` — wallet pk, paused bool.
- `agent_tasks` (wave 2) — id, wallet, thread_id, bot_id, title, goal, status, steps jsonb,
  checkpoint jsonb, error, attempts, next_tick_at, created_at, updated_at.
- `agent_connectors` (wave 2) — id, wallet, kind 'mcp'|'google', name, url, secret_enc text,
  status, created_at. Secrets AES-GCM with `CHAT_CONNECTOR_KEY`.

## 4. Tool packs

**roebel (read):** `search_roebel`, `list_events`, `get_event`, `list_news`, `get_news_article`,
`list_orgs` (businesses/restaurants/Vereine), `get_org`, `list_deals`, `list_marketplace`,
`list_proposals`, `list_feed_posts`, `get_menu` (restaurants), `abfallkalender`, `get_treasury`
(Gemeinschaftskasse figures). All tenant-scoped, compact outputs, deep links (`appOrigin/...`).
**user (private):** `my_profile`, `my_orgs`, `my_tickets`, `my_events`, `my_muenzen_balance`,
`my_notifications`. **memory (private):** `remember(fact)`, `recall(query)`, `forget(id)`.
**web:** `fetch_url` (https only, 1 MB cap, readability → text ≤ 20k chars, blocks private IPs).
**actions (public, wave 2):** `create_feed_post`, `submit_event`, `create_listing`,
`comment_on_post`, `send_direct_message` (Supabase rail), `create_org_event` (org owners),
`send_email` (Resend, external). **money (wave 2):** `transfer_muenzen`. **connectors (wave 2):**
MCP tools namespaced `mcp_<server>_<tool>` (risk `external` unless the server marks read-only),
Google Gmail/Calendar/Drive (gated off until `GOOGLE_OAUTH_CLIENT_ID/SECRET` exist).
**tasks (wave 2):** `start_task(goal, steps?)`, `ask_bot(botId, question)`.

## 5. Context builder
System prompt = house rules + bot instructions + `Über den Menschen` (display name, citizen,
orgs+roles) + `Über ${tenant.name}` (facts) + `Was du dir gemerkt hast` (≤ 20 memories for this
wallet/bot) + Berlin date/time + files + tool-use policy text ("Öffentliche Aktionen, Geld und
externe Dienste brauchen eine Freigabe — schlag vor, der Mensch bestätigt").

## 6. App (Expo, OTA)
`ApprovalCard` (ref style of the integration card: title, summary, preview block per kind, black
"Freigeben", text "Ablehnen", checkbox "Immer erlauben" when `canAlwaysAllow`; states pending /
executed ✓ / rejected / failed) → approve/reject stream into the thread via the existing SSE client.
Money: approve → app performs the Münzen transfer with the user's wallet (reuse the app's existing
transfer code) → `/complete`. `TaskCard` (title + step list with spinners/checks). Settings screens
under the chat ⋯ menu: **Gedächtnis** (list + delete), **Aktivität** (audit list), **Verbindungen**
(wave 2), and bot sheet **Berechtigungen** (always-allowed tools).

## 7. Waves
1. Core (registry, policy, approvals + SSE continuation, audit, memory, context, tenant), roebel +
   user + web packs, app approval/memory/activity/permissions.
2. Durable tasks + worker + TaskCard; action pack; Münzen via device signing.
3. MCP connectors; Google OAuth (built, gated on Max's Google Cloud OAuth client + verification).
4. Field research → inspiration screen (§1).
