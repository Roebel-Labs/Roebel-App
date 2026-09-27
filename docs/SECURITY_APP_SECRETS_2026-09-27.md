# App secrets moved to the server (2026-09-27)

Branch `feat/app-secrets-server`. The Expo app shipped secret keys to every user. This change
moves every use of those keys behind web API routes. **The keys that already shipped are public
and must be rotated.** Removing them from the code protects future builds and OTAs only.

## 1. What leaked, and where

| Secret | Where it leaked | Since | Who could use it |
|---|---|---|---|
| `IRYS_UPLOAD_PRIVATE_KEY` (EOA that pays Irys uploads, holds Base ETH + the Irys node balance) | `apps/expo/app.config.ts` → `extra`, so it sat **in the public manifest of every build and every OTA update** | monorepo start (2026-03-29) | Anyone who fetched a manifest. They could spend the wallet's ETH and its Irys balance. No app code ever read the key: it was dead config, but it was published all the same. |
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | Inlined into the JS bundle (`EXPO_PUBLIC_*` is replaced at bundle time) via `lib/services/anthropic-chat.ts` (Mecky), `components/ai/MinimalAIChat.tsx` (event assistant), `app/submit-event.tsx` (description helper), `lib/tools/event-submission-tools.ts` + `lib/utils/flyer-extraction.ts` (flyer reading) | 2026-03-29 | Anyone who unpacked the bundle. Unlimited Claude usage on our bill. |
| `EXPO_PUBLIC_SEED_TOKEN` | Inlined into the bundle via `lib/generate-menu-image-client.ts` | 2026-05-22 (`4cc56bd5`) | Anyone could call the `generate-menu-image` edge function (paid kie.ai images) and, because that function writes with the service role, **overwrite the image of any menu item of any restaurant**. The same token also unlocks the `kie-proxy` edge function. |
| `EXPO_PUBLIC_OPENAI_API_KEY` | Present in the local `.env` and in `.env.example` under an `EXPO_PUBLIC_` name. **No app code ever referenced it** (checked with `git log -S` over `apps/expo`), so Metro never inlined it. | n/a | Most likely nobody. Rotate as a precaution: the key was one code line away from being inlined, and it probably also sits in EAS env. |

Also found while fixing the Irys path (web, not the app):

- `POST /api/irys/upload` had **no authentication**. Anyone could upload anything, with any
  `Uploader` tag, on the server wallet's balance.
- `POST /api/irys/fund` had **no authentication**. Anyone could move the server wallet's ETH onto
  the Irys node, up to 0.005 ETH per call with no limit on the number of calls.

## 2. What moved

| Before (app) | Now | Auth | Rate limit (per wallet) |
|---|---|---|---|
| `fetch('https://api.anthropic.com/v1/messages', { 'x-api-key': EXPO_PUBLIC_ANTHROPIC_API_KEY })`, 5 call sites | `POST /api/ai/anthropic` (`apps/web/src/app/api/ai/anthropic/route.ts`, logic in `apps/web/src/lib/ai-proxy/anthropic.ts`). The body is the unchanged Anthropic Messages request. JSON and SSE responses come back byte for byte, so the app's parsers did not change. Model allowlist (`claude-haiku-4-5`, `claude-sonnet-4-6`), `max_tokens` ≤ 4096, server tools refused, unknown top-level fields dropped, body ≤ 4 MB. | Chat-session Bearer token (`lib/chat/session.ts`): the app signs silently once per 30 days with the thirdweb Gnosis account, then reuses the token from SecureStore. On a 401 it signs again automatically. | 40/min, 400/day |
| `generate-menu-image` edge function called directly with `x-seed-token: EXPO_PUBLIC_SEED_TOKEN` | `POST /api/ai/menu-image` (`apps/web/src/lib/ai-proxy/menu-image.ts`). It forwards the same JSON fields with `SUPABASE_SEED_TOKEN` (the server env the web dashboard already used) and returns the edge function's JSON unchanged. | Chat-session Bearer token, **plus a new ownership check**: `menu_items.restaurant_id → restaurants.account_id → account_owners(wallet)` | 20/hour, 60/day |
| `IRYS_UPLOAD_PRIVATE_KEY` in `extra` | Removed from `app.config.ts`. `extra` now carries a comment saying it is public. The key exists only in Vercel env (`/api/irys/*`). | n/a | n/a |
| `/api/irys/upload` open to anyone | Same route, same `{content, tags, userAddress}` → `{success, id, url, receipt}` contract. It now requires `auth: {timestampSec, signature}`: a signature by `userAddress` over `roebel-irys-v1:upload:<wallet>:<ts>:<hash({contentSha256, tagsSha256})>` (`apps/web/src/lib/irys/upload-message.ts`). The signature is verified EOA → ERC-1271/6492 on Gnosis and must be ≤ 5 min old. `Uploader`/`Timestamp`/`App-Version` tags cannot be spoofed. Content ≤ 1 MB, ≤ 20 tags. The web client (`apps/web/src/lib/irys.ts`) signs automatically. | Wallet signature | 20/hour, 60/day |
| `/api/irys/fund` open to anyone | Requires the signed admin-dashboard session cookie (`dashboard-session`) | Admin session | n/a |

`/api/irys/balance` stays public on purpose. It is read-only, shows only the (public) address
and balance, and is rendered by the proposal form outside the admin area too.

**Rate limits** (`apps/web/src/lib/rate-limit/`): every route always has a per-instance
in-memory window. A shared window across all instances needs the Postgres function
`api_rate_limit_take` from `supabase/migrations/20260927_api_rate_limits.sql`. **That migration
is NOT applied yet.** Until it is, the limiter logs one warning per instance and keeps the
in-memory limit. Nothing breaks either way.

**Old app versions keep working until the keys are rotated.** They call Anthropic, the edge
function and nothing Irys-related directly, and none of that changed. After the next OTA/build,
apps call the new routes. Nobody is logged out: the chat session is an extra token next to the
existing login, and it is obtained silently.

## 3. Rotation checklist for Max

Do this **after** the web routes are deployed and the OTA/build with this branch is out. Rotating
earlier breaks Mecky, the event assistant and menu images for everyone still on the old JS.
Rotating later leaves the public keys usable. The keys are already public, so do not wait weeks.
A few days after the OTA is a reasonable compromise. Runtimes that cannot receive the OTA (older
than 3.7.0) lose the AI features at rotation time either way.

1. **Irys wallet** (the old private key is public: treat the wallet as compromised)
   - [ ] Generate a new EOA (never a personal wallet): `node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"`
   - [ ] Withdraw the Irys node balance of the old wallet, if any, then move all remaining Base ETH from the old address to the new one.
   - [ ] Vercel (web project `prj_XuLVdSdtz41tJiW6UvwkI4YjbLOh`, all targets): set `IRYS_UPLOAD_PRIVATE_KEY` to the new key and redeploy.
   - [ ] Fund the new wallet's Irys balance from the admin dashboard (`/api/irys/fund`, now admin-only).
   - [ ] Never send funds to the old address again.
2. **Anthropic**
   - [ ] Anthropic console: create a new key. Put it in Vercel `ANTHROPIC_API_KEY` (production + preview + development) if the leaked key is the same one Vercel uses. Redeploy.
   - [ ] Revoke the old key (the value that was in `EXPO_PUBLIC_ANTHROPIC_API_KEY`).
   - [ ] Optional: set a monthly spend limit on the workspace.
3. **OpenAI** (precaution)
   - [ ] Revoke the key that was in `EXPO_PUBLIC_OPENAI_API_KEY`. If Vercel `OPENAI_API_KEY` holds the same value, create a new key there first and redeploy.
4. **Seed token** (`SEED_TOKEN` on Supabase, `SUPABASE_SEED_TOKEN` on Vercel. The two must be equal.)
   - [ ] Generate a new random value.
   - [ ] Supabase project secrets: set `SEED_TOKEN` (used by `generate-menu-image` and `kie-proxy`).
   - [ ] Vercel: set `SUPABASE_SEED_TOKEN` to the same value and redeploy.
   - Effect: old app versions can no longer regenerate menu images (the menu admin shows an error code). Everything else keeps working.

## 4. EAS / local env cleanup (after rotation)

Delete from EAS environment variables (all environments: development, preview, staging, production):

- `EXPO_PUBLIC_ANTHROPIC_API_KEY`
- `EXPO_PUBLIC_OPENAI_API_KEY`
- `EXPO_PUBLIC_SEED_TOKEN`
- `IRYS_UPLOAD_PRIVATE_KEY` (the app no longer reads it)
- `THIRDWEB_SECRET_KEY`, if present (the app never used it)

Delete the same names from the local `apps/expo/.env` on every machine that runs `eas update`.
Known trap (see memory `reference_ota_env_leak_local_env`): Metro's cache can re-serve values it
inlined earlier. Publish the first OTA after this change with `expo export --clear` and grep the
`.hbc` output for the old key prefixes before `eas update --skip-bundler`.

## 5. What stays in the bundle / `extra` (public by design)

| Value | Why it is fine | Recommended hardening |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Publishable key; access is governed by RLS | Apply the pending RLS lockdown (memory `project_rls_lockdown_unapplied`) |
| `THIRDWEB_CLIENT_ID` (`EXPO_PUBLIC_THIRDWEB_CLIENT_ID`) | Public client id | Restrict to the app bundle ids in the thirdweb dashboard |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Client key by design | Make sure it is restricted to the Android/iOS apps and the Maps/Places APIs in Google Cloud |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Public `pk.` token | URL/app restriction in Mapbox |
| `EXPO_PUBLIC_POSTHOG_KEY` / `_HOST`, `EXPO_PUBLIC_SENTRY_DSN` | Ingest-only public keys | – |
| `EXPO_PUBLIC_GNOSISPAY_PARTNER_ID` / `_APP_ID` / `_API_URL` / `_SIWE_DOMAIN` | Public identifiers for the SIWE flow | – |
| RPC/bundler URLs, contract addresses, `MINIAPP_API_BASE`, `EXPO_PUBLIC_API_BASE_URL`, passkey/paymaster addresses, XMTP env | Public endpoints/addresses | Keep paid RPC endpoints out of `EXPO_PUBLIC_*` if they ever embed an API key |

Rule going forward: `extra` and `EXPO_PUBLIC_*` are public. A paid-service key or a shared
secret never goes there. Put it in a web route or an edge function that authenticates the caller.

## 6. Gates

- [ ] Merge `feat/app-secrets-server` and deploy the web app (Vercel). Required env is already present in production: `ANTHROPIC_API_KEY`, `CHAT_SESSION_SECRET`, `SUPABASE_SEED_TOKEN`, `IRYS_UPLOAD_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (checked 2026-09-27 by name only).
- [ ] Apply `supabase/migrations/20260927_api_rate_limits.sql` (shared rate limits; optional for correctness).
- [ ] Publish the Expo OTA/build **after** the web deploy (the new app JS needs the new routes).
- [ ] Device pass: Mecky message, event assistant with a flyer photo, "Beschreibung generieren", menu image regeneration (org member), citizen verification upload on web.
- [ ] Rotate (section 3), then clean up EAS/local env (section 4).
