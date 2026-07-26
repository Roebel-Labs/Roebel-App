# Röbel ID — OIDC Provider

A panva `node-oidc-provider` instance bridging wallet identity (thirdweb smart accounts on Gnosis) to OpenID Connect, enabling Nextcloud SSO via SIWE (Sign in with Ethereum) verification.

## Development

### Local dev server
```bash
pnpm --filter @roebel/roebel-id dev
```
Runs on http://localhost:3010 (or `PORT` env var).

### Generate JWKS secret

Generate a new JWK Set (RS256 keypair) for signing ID tokens:
```bash
pnpm --filter @roebel/roebel-id exec tsx scripts/generate-jwks.ts
```
Copy the JSON output into the `JWKS_JSON` secret on Fly (see Deployment below).

## Deployment (Fly.io)

### 1. Set secrets
```bash
fly secrets set \
  COOKIE_KEYS=your-secret-key-1,your-secret-key-2 \
  SUPABASE_SERVICE_KEY='...' \
  NEXTCLOUD_CLIENT_SECRET='...' \
  JWKS_JSON='{"keys":[{...}]}' \
  -a roebel-id
```

### 2. Deploy
```bash
fly deploy -c apps/roebel-id/fly.toml
```

### 3. List active secrets
```bash
fly secrets list -a roebel-id
```

## Deploy (verify the container build first)

The container build was NOT run/verified in-session. On first `fly deploy`, verify that the image builds successfully. If pnpm errors because workspace packages are missing, the fallback is to use `turbo prune --docker @roebel/roebel-id` to produce a pruned build context, or copy all workspace `package.json` files before the install step.

## Why `min_machines_running = 1`?

Sessions and signing keys are stored in-memory. Scaling to 0 machines (auto-stop) would lose them, breaking login sessions in progress. The `min_machines_running = 1` setting keeps one machine always running on Fly.

## Architecture

- **SIWE Verification**: Validates Ethereum signatures against thirdweb smart accounts (Gnosis chain).
- **AuthBridge**: Maps wallet address → Supabase user record (identity minting, claims resolver).
- **panva oidc-provider**: Implements OpenID Connect core & implicit flows, issuing ID tokens signed with RS256.
- **Nextcloud Redirect**: OAuth2 flow completes at `https://cloud.roebel.app/apps/user_oidc/code`.

## Agent principals

Röbel ID also mints non-interactive access tokens for **agent principals** (e.g. Mecky acting on
behalf of a citizen/org). An agent is a separate OIDC concept from a human login: it never runs the
`authorization_code` browser flow, it authenticates directly at the token endpoint.

### Registering an agent

An agent is a row in `public.id_agents` (`apps/roebel-id/migrations/2026-07-26-id-agents.sql`,
service-role only — no RLS policy grants anon/authenticated access, since `client_secret` lives
here):

| column | meaning |
|---|---|
| `address` | lowercased smart-account address; doubles as the OIDC `client_id` and the token's `sub` |
| `owner_sub` | the human/org principal that authorised this agent (lands in `act.sub`) |
| `scopes` | the agent's granted scope strings (e.g. `workspace:draft`) |
| `budget_ref` | reference to a Zodiac Roles spending budget — stored/surfaced only; **enforcement is not built yet** (planned P3b) |
| `client_secret` | the `client_credentials` secret |
| `enabled` | the kill switch — `false` immediately revokes the agent, no redeploy needed |

Insert/update this row via the Supabase MCP (service-role), following the project's "use the
Supabase MCP" rule — never raw SQL/CLI.

### Requesting a token

An agent authenticates with HTTP Basic auth using its address as `client_id` and its
`client_secret`, via the `client_credentials` grant:

```bash
curl -u "<address>:<client_secret>" \
  -d grant_type=client_credentials -d scope="roebel:agent workspace:draft" \
  https://id.roebel.app/token
```

### What the token carries

The response is a JWT access token (forced to JWT format via a `roebel:agent`-scoped resource
indicator — panva's default `client_credentials` token is opaque). Its claims:

- `sub` — the agent's address (the client_id itself; there is no separate account)
- `roebel:actor_type` — `'agent'`, so downstream services can tell an agent-issued token apart from a human's
- `act.sub` — the owning human/org principal (`owner_sub`), per RFC 8693 delegation semantics — "this agent is acting on behalf of `act.sub`"
- `roebel:scopes` — the agent's full granted scope list from the `id_agents.scopes` registry row (not filtered/intersected against the request's `scope` param — that request-vs-registry narrowing is not implemented yet)

### Kill switch

Flipping `id_agents.enabled` to `false` for an address takes effect on the *next* token request —
no cache, no restart. Internally this works two ways, both keyed off `agentReader`
(`src/agents/reader.ts`) reading the live Supabase row:

- `agentClientFind` (`src/agents/client-source.ts`) resolves a disabled/unknown agent's OIDC
  `Client` to `undefined`, so panva treats the `client_id` as non-existent and refuses the
  `client_credentials` grant with `401 invalid_client`.
- `getResourceServerInfo` (`src/oidc/provider.ts`) independently re-checks `agent.enabled` before
  vending the `roebel:agent` JWT resource, as defence-in-depth against an explicit `resource=`
  parameter reaching it through any other path.

See `test/agent-killswitch.test.ts` for the end-to-end proof (enabled → 200, then disabled → 401
`invalid_client`, same client/secret/provider instance).
