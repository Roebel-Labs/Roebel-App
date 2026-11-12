# Ortis credits, subscriptions and own keys (design)

Date: 2026-11-13 · Status: §4 (own keys) BUILT; §2, §3, §5, §6 DRAFT awaiting Max's decisions in §8 ·
Builds on: `2026-11-12-ortis-studio-workspace-design.md`, `2026-09-25-mecky-chat-suite-design.md` (tiers,
`quota.ts`), `docs/future-research/2026-09-26_AGENT_INSPIRATION_FIELD_RESEARCH.md` §5 (price anchors)

## 1. Intent (Max, 2026-11-12)

- Max must not pay every user's AI tokens. Everyone gets a **free allowance**; when it is used up there
  is a **top-up**, there are **subscriptions**, and there is the option to use **own API keys**.
- **One multi-purpose subscription**, like kie.ai: chat, content, images, audio, everything multimodal
  under one plan, one unit of account.
- Subscriptions must be attractive enough that people *want* one, and Max must still be profitable.
- The product must know the user as well as Town and Grok Bot do: what they work on, their contacts.
  Contacts from email and from the Röbel App should be one interoperable address book.
- The long game: a **trust graph of real humans** (citizen verification + Circles trust) so people can
  interact safely in a world of AI scams, bots and deepfakes. This is the moat, and it stays free.

## 2. Unit of account: Credits

One **Credit = 1 cent of provider cost at list price**, the same unit for every modality. The platform
prices each action from its real provider cost with one markup, so a chat turn, an image and a voice
note all draw from the same pot (the kie.ai model).

| Action (typical size) | Provider cost (list, 2026-11) | Credits charged (×2) |
|---|---|---|
| Chat turn on `bot-fast` with Haiku 5.5 (6k in / 0.6k out) | $0.0009 | 0.2 |
| Chat turn on `bot-smart` with Sonnet 5.5 (6k in / 0.6k out) | $0.018; ≈ $0.011 with prompt caching | 2 (chat), 3 (with web search) |
| Chat turn on an Opus 5.5 route (6k / 0.6k) | $0.036 | 6 |
| Dictation, 1 min (OpenAI gpt-4o-mini-transcribe) | ≈ $0.006 | 1 |
| Image (kie.ai nano-banana-2-lite) | per kie.ai list price at build time | cost × 2, rounded up |
| Voice/TTS (ElevenLabs) | per list price | cost × 2 |

Prices come from `lib/ai-usage/pricing.ts` (already the source for `chat_runs.cost_micros` and
`ai_usage_events`); the credit table is derived, never hand-maintained.

**Cost lever before anything else:** the routes still run Haiku 4.5 ($1/$5) and Sonnet 5 ($2/$10).
Haiku 5.5 is $0.10/$0.50, Sonnet 5.5 the same price as Sonnet 5. Switching `bot-fast` to
`claude-haiku-5-5` cuts the fast route's cost 10×; `bot-smart` to `claude-sonnet-5-5` is free. This is
Max's decision (model choice), listed in §8.

## 3. Plans

Anchors: the field research (§5) priced Plus 9,99 €, Ultra 29,99 €, Betrieb 39 €, Verein 14,99 €, and
noted "B2C stays free, it is the distribution". Numbers below are **monthly**, gross incl. 19 % VAT.

| Plan | Price | Credits / month | What else | Max's worst case / month |
|---|---|---|---|---|
| **Kostenlos** | 0 € | 150 | 1 Routine, Röbel-Kontext, Gedächtnis, Bibliothek, own keys allowed | 1,50 € |
| **Plus** | 9,99 € | 1.200 | 10 Routinen, Verbindungen (Google, später Microsoft), Bilder + Audio im selben Topf, Nutzen-Bericht | 12 € (at 100 % use) |
| **Ultra** | 29,99 € | 4.000 | unbegrenzte Routinen, lange Aufgaben, Opus-Route, Priorität | 40 € |
| **Verein** | 14,99 € | 1.500 | Org-Kontext für mehrere Mitglieder, Freigaben im Team | 15 € |
| **Betrieb** | 39 € | 5.000 | wie Verein + Mini-App-Analytics, später AVV/Enterprise | 50 € |
| **Aufladen** | 5 / 10 / 25 € | 450 / 1.000 / 2.750 | 12 Monate gültig, kein Abo nötig | — |

Why this is profitable even though the worst case exceeds the price: usage-capped AI plans run on the
median, not the cap. Industry median use is 20–35 % of the allowance. At 30 %:

| | Plus 9,99 € |
|---|---|
| net of 19 % VAT | 8,39 € |
| Stripe (1,5 % + 0,25 €) | − 0,38 € |
| model cost at 30 % of 1.200 credits (= 360 cents list) | − 3,60 € |
| **contribution per user** | **≈ 4,40 €** |

With the Haiku 5.5 / Sonnet 5.5 routes the real list cost is lower than the credit table assumes
(credits are ×2), so contribution is nearer 6 €. At the STRATEGY sustain target (€2–3k MRR) that is
roughly 250 Plus subscribers or 40 Betrieb licences; infrastructure today is ≈ €250/month.

**Why people want the subscription** (the levers that work, in order): the first task is always free;
routines run only on paid plans (the thing that works while you sleep); images and voice without a
second product; the monthly **Nutzen-Bericht** ("du hast 4 Stunden gespart"); introductory month free
with three suggested tasks; Betrieb gets the Mini-App numbers. Trust features are **not** paywalled.

**Own keys (BYOK):** model calls on the user's own Anthropic key cost no credits and have no quota
(built, §4). Images and audio still draw credits because those run on Max's provider accounts.

## 4. Own keys — BUILT 2026-11-13 (main `0465cf9e`)

- Table `chat_provider_keys` (wallet, provider ∈ anthropic|openai, AES-GCM `key_enc` under
  `CHAT_CONNECTOR_KEY`, `last4`); `chat_runs.billed_to` ∈ platform|own_key.
- `PUT /api/chat/provider-keys` verifies the key live (one `GET /v1/models`), then stores it.
  `GET` returns provider + last4 only. `DELETE ?provider=`.
- `resolveModelFor(wallet, route)` runs the same route on the user's key; the gateway (self-hosted)
  still wins when configured. `checkQuota` never reports exceeded for a wallet with an own key.
- Studio: Einstellungen → KI-Schlüssel. The Röbel app gets the same screen next.

## 5. Credits ledger and purchases (NOT built)

- `chat_credit_ledger` (wallet, delta, reason ∈ plan_grant|topup|usage|refund|bonus, ref, created_at)
  + a materialised balance; `chat_runs`/`ai_usage_events` post `usage` rows from `cost_micros`.
- Monthly grant job per plan; grants expire at period end, top-ups after 12 months (FIFO).
- Stripe Checkout for top-ups and Stripe Billing for plans (web/desktop → no app-store cut);
  webhook → ledger + `chat_entitlements`. The Röbel app shows the same balance; in-app purchase via
  RevenueCat stays OFF until Max says (decision on record).
- Quota becomes "credits left"; `QUOTA_MESSAGE` becomes "Aufladen oder Plan wählen".

## 6. Personalisation, contacts and the trust graph

- **First-connect moment** (Town's magic): on connecting Google, one pass over the next 14 days of
  calendar and the last 30 days of mail headers writes 10–20 memory facts ("arbeitet am Herbstfest",
  "Vorstand im SV Röbel") and proposes three routines. Facts are shown to the user before saving.
- **"Über mich"**: an editable profile the agent reads first (role, projects, orgs, tone). Lives in
  `agent_memory` with a `kind='profile'` flag; the harness already injects memory.
- **One address book**: email correspondents (from the connector) merged with Röbel accounts by
  email/username/display name; each contact carries a **trust level**: verified citizen
  (CitizenNFTv2), Circles-trusted by people you trust, Röbel account, unknown. The agent prefers
  verified contacts, and mail triage labels senders ("verifizierter Röbeler", "unbekannt").
- **Anti-scam use of the trust graph**: any request involving money, codes or credentials from an
  unverified sender is flagged before the user acts; "Kopplung nur bestätigen, wenn der Code auf
  deinem Bildschirm steht" was the first instance of this rule. Later: a public verification check
  other apps can call (NSP), the proof that the graph is a product.
- This is free for every verified human. The subscription sells *work done*, never *trust*.

## 7. Gates (not code)

- **Legal entity** before any paid plan: Impressum, VAT, terms, refund policy; Stripe live keys and
  the billing webhook on the entity. (Same gate as the enterprise tier.)
- `OPENAI_API_KEY` is **not set in Vercel production** (only Development/Preview): dictation in the
  live app fails until it is added.
- Google connector: `GOOGLE_OAUTH_CLIENT_ID/SECRET` on Vercel (Max creates the client).

## 8. Decisions for Max

1. Credit unit and the ×2 markup. Free allowance 150 credits/month (≈ 75 Sonnet turns)?
2. Prices: Plus 9,99 / Ultra 29,99 / Verein 14,99 / Betrieb 39, top-ups 5/10/25 €?
3. Switch `bot-fast` → `claude-haiku-5-5` and `bot-smart` → `claude-sonnet-5-5` now?
4. Order: credits + Stripe (§5) first, or personalisation + contacts (§6) first?
5. Entity: which legal form and when, so that §5 can go live?
