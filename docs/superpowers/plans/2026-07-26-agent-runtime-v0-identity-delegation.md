# Agent Runtime v0 — Agent Identity, Delegation & Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AI agents a first-class, self-sovereign identity in the existing **Röbel ID** OIDC provider — a non-interactive (client-credentials) token that carries the agent's own address, an `act` delegation claim ("acting on behalf of principal Y"), the agent's granted scopes, is fully audited, and is instantly revocable by a kill switch.

**Architecture:** Extends `apps/roebel-id` (panva `oidc-provider` v8 + Express + Supabase + viem). An **agent registry** (`id_agents` Supabase table) is the source of truth for agent principals. Agents authenticate via the OIDC **`client_credentials`** grant, served as **dynamic OIDC clients built from the registry** through a wrapped Supabase adapter (Nextcloud stays a static client). The issued **JWT access token** gets `roebel:actor_type:'agent'`, `act:{sub:<owner>}` (RFC 8693), and `roebel:scopes` via `extraTokenClaims`; every issuance writes an `id_agent_audit` row; a disabled agent's client no longer resolves, so no token can be minted.

**Tech Stack:** TypeScript ESM · panva `oidc-provider@^8.5.3` · `express@4` · `@supabase/supabase-js@2` · `viem@2` · `jose@6` (JWT decode in tests) · **vitest + supertest/fetch** (test runner). Supabase DDL applied via the **Supabase MCP** (repo policy — the `supabase` CLI is intentionally absent).

## Global Constraints

- **ESM, `.js` import specifiers.** Package is `"type":"module"`; every relative import ends in `.js` (e.g. `import { x } from './agents/reader.js'`), matching the existing `src/`.
- **Addresses are lowercased everywhere.** `sub`, agent address, and `act.sub` are the lowercased smart-account address, consistent with `users.wallet_address` keying (see `resolver.ts:7`).
- **The agent access token MUST be a JWT** carrying, at minimum: `sub` = agent address; `roebel:actor_type` = `'agent'`; `act` = `{ sub: <owner principal address> }` (RFC 8693 §4.1); `roebel:scopes` = the agent's granted scope array. Human tokens are unchanged (`actor_type:'human'`).
- **Kill switch is absolute:** `id_agents.enabled = false` ⇒ the agent client does not resolve ⇒ `/token` returns `invalid_client`, no token minted.
- **Audit is mandatory:** every agent token issuance writes one `id_agent_audit` row (agent, `act.sub`, scopes, jti, issued_at).
- **Test wiring mirrors `test/e2e-flow.test.ts`:** `buildProvider({config, adapterFactory: makeSupabaseAdapterFactory({client: fakeClient()}), resolveClaims, ...})`, real RS256 JWKS via `process.env.JWKS_JSON`, in-process HTTP server, `fetch` with `redirect:'manual'`. Reuse the `fakeClient()` fake for Supabase.
- **Run tests with:** `pnpm --filter @roebel/roebel-id test` (vitest). Type-check with `pnpm --filter @roebel/roebel-id build`.
- **OUT OF SCOPE — separate follow-on plans:** on-chain **Zodiac Roles budget enforcement** (P3b — this plan only *stores + surfaces* `budget_ref`, it does not enforce spend), and the **MCP tool-execution runtime** (P3c — agents don't call tools yet; this plan only mints the identity token those runtimes will present). Source design: [`2026-07-25-sovereign-workplace-suite-design.md`](../specs/2026-07-25-sovereign-workplace-suite-design.md) §4 (L4) + [`2026-07-24-roebel-id-sso-keystone-design.md`](../specs/2026-07-24-roebel-id-sso-keystone-design.md) §10.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/roebel-id/migrations/2026-07-26-id-agents.sql` *(new)* | `id_agents` + `id_agent_audit` tables (applied via Supabase MCP) |
| `apps/roebel-id/src/agents/types.ts` *(new)* | `Agent`, `AgentReader`, `AuditWriter` types |
| `apps/roebel-id/src/agents/reader.ts` *(new)* | Supabase-backed `createAgentReader(client)` → `AgentReader` |
| `apps/roebel-id/src/agents/audit.ts` *(new)* | Supabase-backed `createAuditWriter(client)` → `AuditWriter` |
| `apps/roebel-id/src/agents/client-source.ts` *(new)* | `buildAgentClient(agent)` → panva `ClientMetadata`; the wrapped-adapter Client resolver |
| `apps/roebel-id/src/claims/resolver.ts` *(modify)* | agent-aware: registered agent → `actor_type:'agent'` |
| `apps/roebel-id/src/oidc/provider.ts` *(modify)* | `client_credentials` grant, JWT access-token format, dynamic agent clients, `extraTokenClaims`, audit event |
| `apps/roebel-id/src/wire.ts` *(modify)* | wire agent reader + audit writer into resolver + provider |
| `apps/roebel-id/test/*` *(new)* | one test file per task |

---

### Task 1: Agent registry — data model, migration & reader

**Files:**
- Create: `apps/roebel-id/migrations/2026-07-26-id-agents.sql`
- Create: `apps/roebel-id/src/agents/types.ts`
- Create: `apps/roebel-id/src/agents/reader.ts`
- Test: `apps/roebel-id/test/agents-reader.test.ts`

**Interfaces:**
- Produces: `Agent` = `{ address: string; ownerSub: string; displayName?: string; scopes: string[]; budgetRef?: string; clientSecret: string; enabled: boolean }`; `AgentReader` = `(address: string) => Promise<Agent | null>`; `createAgentReader(client: SupabaseClient): AgentReader`.

- [ ] **Step 1: Write the migration SQL.**

```sql
-- apps/roebel-id/migrations/2026-07-26-id-agents.sql
-- Agent principals for Röbel ID. Service-role only; anon/authenticated get NOTHING
-- (client secrets live here). Applied via the Supabase MCP.
create table if not exists public.id_agents (
  address        text primary key,                 -- lowercased smart-account address = OIDC client_id + sub
  owner_sub      text not null,                     -- the authorising human/org principal (act.sub)
  display_name   text,
  scopes         text[] not null default '{}',      -- granted scope strings
  budget_ref     text,                              -- reference to a Zodiac Roles budget (enforced in P3b)
  client_secret  text not null,                     -- client_credentials secret (service-role only)
  enabled        boolean not null default true,     -- kill switch
  created_at     timestamptz not null default now()
);
alter table public.id_agents enable row level security;
-- No policies → only the service_role key (which bypasses RLS) can read/write.

create table if not exists public.id_agent_audit (
  id           bigint generated always as identity primary key,
  agent        text not null,
  act_sub      text not null,
  scopes       text[] not null default '{}',
  jti          text,
  issued_at    timestamptz not null default now()
);
alter table public.id_agent_audit enable row level security;
```

- [ ] **Step 2: Apply the migration to the dev/staging DB via the Supabase MCP** (`apply_migration`, name `id_agents`). Confirm the two tables exist (`list_tables`).

- [ ] **Step 3: Write the types.**

```ts
// apps/roebel-id/src/agents/types.ts
export interface Agent {
  address: string
  ownerSub: string
  displayName?: string
  scopes: string[]
  budgetRef?: string
  clientSecret: string
  enabled: boolean
}
export type AgentReader = (address: string) => Promise<Agent | null>
export interface AuditEntry { agent: string; actSub: string; scopes: string[]; jti?: string }
export type AuditWriter = (entry: AuditEntry) => Promise<void>
```

- [ ] **Step 4: Write the failing test.**

```ts
// apps/roebel-id/test/agents-reader.test.ts
import { describe, it, expect } from 'vitest'
import { createAgentReader } from '../src/agents/reader.js'

function fakeClient(row: any) {
  return { from() { const s: any = { f: {} }; const api: any = {
    select() { return api }, eq(k: string, v: any) { s.f[k] = v; return api },
    maybeSingle() { return Promise.resolve({ data: row && Object.entries(s.f).every(([k, v]) => row[k] === v) ? row : null, error: null }) },
  }; return api } }
}

describe('createAgentReader', () => {
  it('maps an id_agents row to an Agent (enabled)', async () => {
    const reader = createAgentReader(fakeClient({
      address: '0xaaa', owner_sub: '0xowner', display_name: 'Mecky', scopes: ['roebel:agent'],
      budget_ref: 'zodiac:1', client_secret: 's3cr3t', enabled: true,
    }) as any)
    const agent = await reader('0xAAA')
    expect(agent).toEqual({ address: '0xaaa', ownerSub: '0xowner', displayName: 'Mecky',
      scopes: ['roebel:agent'], budgetRef: 'zodiac:1', clientSecret: 's3cr3t', enabled: true })
  })
  it('returns null for an unknown address', async () => {
    const reader = createAgentReader(fakeClient(null) as any)
    expect(await reader('0xnope')).toBeNull()
  })
})
```

- [ ] **Step 5: Run it — expect FAIL** (`createAgentReader` undefined). `pnpm --filter @roebel/roebel-id test agents-reader`

- [ ] **Step 6: Implement the reader.**

```ts
// apps/roebel-id/src/agents/reader.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Agent, AgentReader } from './types.js'

export function createAgentReader(client: SupabaseClient): AgentReader {
  return async (rawAddress: string): Promise<Agent | null> => {
    const address = rawAddress.toLowerCase()
    const { data, error } = await client.from('id_agents')
      .select('address, owner_sub, display_name, scopes, budget_ref, client_secret, enabled')
      .eq('address', address).maybeSingle()
    if (error) { console.error('agent reader: query failed', error); throw error }
    if (!data) return null
    return {
      address: data.address, ownerSub: data.owner_sub, displayName: data.display_name ?? undefined,
      scopes: data.scopes ?? [], budgetRef: data.budget_ref ?? undefined,
      clientSecret: data.client_secret, enabled: data.enabled,
    }
  }
}
```

- [ ] **Step 7: Run it — expect PASS.**

- [ ] **Step 8: Commit.**

```bash
git add apps/roebel-id/migrations/2026-07-26-id-agents.sql apps/roebel-id/src/agents/types.ts apps/roebel-id/src/agents/reader.ts apps/roebel-id/test/agents-reader.test.ts
git commit -m "feat(roebel-id): agent registry table + reader"
```

---

### Task 2: Agent-aware claims resolver

**Files:**
- Modify: `apps/roebel-id/src/claims/resolver.ts`
- Test: `apps/roebel-id/test/resolver-agent.test.ts`

**Interfaces:**
- Consumes: `AgentReader` (Task 1).
- Produces: `createClaimsResolver` now takes an added dep `agent: AgentReader`; when `agent(address)` returns an enabled agent, the resolved claims have `'roebel:actor_type':'agent'` and `groups` includes `'agent'`; otherwise the existing human path is unchanged.

- [ ] **Step 1: Write the failing test.**

```ts
// apps/roebel-id/test/resolver-agent.test.ts
import { describe, it, expect } from 'vitest'
import { createClaimsResolver } from '../src/claims/resolver.js'

const humanDeps = {
  profile: async () => ({ name: 'Anke', email: 'a@b.de' }),
  orgs: async () => [], chain: async () => ({ citizen: true, attester: false }),
}
describe('createClaimsResolver — agent awareness', () => {
  it('marks a registered agent as actor_type=agent', async () => {
    const resolve = createClaimsResolver({ ...humanDeps,
      agent: async (a) => a === '0xagent' ? { address: '0xagent', ownerSub: '0xowner', scopes: ['roebel:agent'], clientSecret: 'x', enabled: true } : null })
    const c = await resolve('0xAGENT')
    expect(c['roebel:actor_type']).toBe('agent')
    expect(c.groups).toContain('agent')
    expect(c.sub).toBe('0xagent')
  })
  it('leaves a human as actor_type=human', async () => {
    const resolve = createClaimsResolver({ ...humanDeps, agent: async () => null })
    const c = await resolve('0xHUMAN')
    expect(c['roebel:actor_type']).toBe('human')
    expect(c.groups).not.toContain('agent')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (resolver has no `agent` dep).

- [ ] **Step 3: Modify the resolver.** Add the `agent` dep and the agent branch; keep the human path byte-identical.

```ts
// apps/roebel-id/src/claims/resolver.ts
import type { RoebelClaims, ProfileReader, OrgReader, ChainStatusReader } from './types.js'
import type { AgentReader } from '../agents/types.js'

export function createClaimsResolver(deps: {
  profile: ProfileReader; orgs: OrgReader; chain: ChainStatusReader; agent: AgentReader
}): (address: string) => Promise<RoebelClaims> {
  return async (rawAddress: string): Promise<RoebelClaims> => {
    const sub = rawAddress.toLowerCase()

    const agent = await deps.agent(sub)
    if (agent && agent.enabled) {
      return {
        sub, name: agent.displayName, preferred_username: agent.displayName,
        groups: ['agent', `owned-by:${agent.ownerSub}`],
        'roebel:citizen': false, 'roebel:attester': false, 'roebel:actor_type': 'agent',
      }
    }

    const [profile, orgs, status] = await Promise.all([deps.profile(sub), deps.orgs(sub), deps.chain(sub)])
    const groups: string[] = []
    if (status.citizen) groups.push('citizen')
    if (status.attester) groups.push('attester')
    for (const o of orgs) groups.push(`org:${o.accountId}:${o.role}`)
    return {
      sub, email: profile?.email, email_verified: profile?.email ? true : undefined,
      name: profile?.name, preferred_username: profile?.name, picture: profile?.picture,
      groups, 'roebel:citizen': status.citizen, 'roebel:attester': status.attester,
      'roebel:tier': profile?.tier, 'roebel:actor_type': 'human',
    }
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Also run the existing `resolver.test.ts` — it will fail to compile because it lacks the new `agent` dep; **fix it** by adding `agent: async () => null` to its `createClaimsResolver` call(s). Re-run: expect PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/roebel-id/src/claims/resolver.ts apps/roebel-id/test/resolver-agent.test.ts apps/roebel-id/test/resolver.test.ts
git commit -m "feat(roebel-id): agent-aware claims resolver (actor_type=agent)"
```

---

### Task 3: Agent OIDC clients + `client_credentials` grant (JWT tokens)

**Files:**
- Create: `apps/roebel-id/src/agents/client-source.ts`
- Modify: `apps/roebel-id/src/oidc/provider.ts`
- Test: `apps/roebel-id/test/agent-token.test.ts`

**Interfaces:**
- Consumes: `AgentReader` (Task 1).
- Produces: `buildAgentClient(agent: Agent): ClientMetadata`; `buildProvider` now accepts an optional `agentReader?: AgentReader`; when present, the provider (a) supports `grant_types: ['client_credentials']` for agent clients, (b) resolves an agent client dynamically from the registry by `client_id`, (c) issues a **JWT** access token. A disabled agent does not resolve (kill switch).

**Panva doc-check (do FIRST):** confirm against `oidc-provider@8.5.3` docs/types: enabling `features.clientCredentials`, issuing **JWT** access tokens (`formats.AccessToken`/`AccessTokenFormat` or the client's `access_token_format`), and **dynamic client loading via the adapter's `Client` model `find(id)`** (panva calls the `Client` adapter when a `client_id` is not in the static `clients` array). Nextcloud stays in the static `clients` array; agents come from the adapter. Adjust the wiring below to the exact v8 API; the tests are the behavioural contract.

- [ ] **Step 1: Write `buildAgentClient` + the Client resolver.**

```ts
// apps/roebel-id/src/agents/client-source.ts
import type { ClientMetadata } from 'oidc-provider'
import type { Agent, AgentReader } from './types.js'

// Map a registry Agent → an OIDC client that authenticates non-interactively.
export function buildAgentClient(agent: Agent): ClientMetadata {
  return {
    client_id: agent.address,
    client_secret: agent.clientSecret,
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    token_endpoint_auth_method: 'client_secret_basic',
    scope: ['roebel:agent', ...agent.scopes].join(' '),
  }
}

// Adapter 'Client' resolver: enabled agent → its client; disabled/unknown → null (kill switch).
export function agentClientFind(agentReader: AgentReader) {
  return async (id: string): Promise<ClientMetadata | undefined> => {
    const agent = await agentReader(id.toLowerCase())
    if (!agent || !agent.enabled) return undefined
    return buildAgentClient(agent)
  }
}
```

- [ ] **Step 2: Wire agent clients + client_credentials + JWT format into `buildProvider`.** Add `agentReader?` to deps; register the `roebel:agent` scope; enable client-credentials; make the `Client` adapter fall through to `agentClientFind`; set the agent client's access-token format to JWT. (Exact v8 surface per the doc-check.)

```ts
// apps/roebel-id/src/oidc/provider.ts — additions (sketch; conform to panva v8 in the doc-check)
import { agentClientFind } from '../agents/client-source.js'
// ...inside buildProvider deps: add `agentReader?: AgentReader`
// scopes: [...existing, 'roebel:agent']
// features: { ...existing, clientCredentials: { enabled: true } }
// wrap adapterFactory so name==='Client' returns an adapter whose find(id) does:
//   const base = await inner.find(id); if (base) return base;      // Nextcloud (static) / stored
//   if (agentReader) { const c = await agentClientFind(agentReader)(id); return c as any }
//   return undefined
// JWT access tokens for agent clients: set formats.AccessToken = (ctx, token) =>
//   token?.gty === 'client_credentials' ? 'jwt' : 'opaque'
```

- [ ] **Step 3: Write the failing test — an agent gets an access token via client_credentials.**

```ts
// apps/roebel-id/test/agent-token.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPair, exportJWK } from 'jose'
import { buildProvider } from '../src/oidc/provider.js'
import { createApp } from '../src/app.js'
import { createInteractionRouter } from '../src/interaction/router.js'
import { makeSupabaseAdapterFactory } from '../src/store/supabase-adapter.js'
import { fakeClient } from './helpers/fake-client.js'   // extract the fake from e2e-flow into a shared helper
import type { AgentReader } from '../src/agents/types.js'

const AGENT = '0xa9e70000000000000000000000000000000000a1'
const OWNER = '0x0000000000000000000000000000000000000owner'.toLowerCase()
const agentReader: AgentReader = async (a) => a === AGENT
  ? { address: AGENT, ownerSub: OWNER, displayName: 'Mecky', scopes: ['workspace:draft'], clientSecret: 'agent-secret', enabled: true } : null

let server: Server, issuer: string
beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(privateKey); jwk.kid = 'k1'; jwk.use = 'sig'; jwk.alg = 'RS256'
  process.env.JWKS_JSON = JSON.stringify({ keys: [jwk] })
  server = createServer(); await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  issuer = `http://localhost:${(server.address() as AddressInfo).port}`
  const config: any = { issuer, cookieKeys: ['k'], chainId: 100, thirdwebClientId: 't',
    nextcloud: { clientId: 'nextcloud', clientSecret: 'secret', redirectUris: [`${issuer}/cb`], postLogoutRedirectUris: [] } }
  const provider = buildProvider({ config, agentReader,
    adapterFactory: makeSupabaseAdapterFactory({ client: fakeClient() as any }),
    resolveClaims: async (a) => ({ sub: a, groups: ['agent'], 'roebel:citizen': false, 'roebel:attester': false, 'roebel:actor_type': 'agent' }) })
  const app = createApp({ provider, interactionRouter: createInteractionRouter({ provider, bridge: { issueNonce: () => 'n', verifyLogin: async () => ({ address: AGENT }) } as any, thirdwebClientId: 't', chainId: 100 }) })
  server.on('request', app)
}, 30000)
afterAll(async () => { if (server) await new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections?.() }) })

it('issues a client_credentials access token to an enabled agent', async () => {
  const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
  const res = await fetch(`${issuer}/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
  expect(res.status).toBe(200)
  const body = await res.json() as { access_token: string; token_type: string }
  expect(body.token_type.toLowerCase()).toBe('bearer')
  expect(body.access_token.split('.').length).toBe(3) // JWT
})
```

- [ ] **Step 4: Extract the shared `fakeClient` helper** to `apps/roebel-id/test/helpers/fake-client.ts` (move the fake from `test/e2e-flow.test.ts`, import it back there). Run `e2e-flow` to confirm no regression.

- [ ] **Step 5: Run `agent-token` — iterate on the panva wiring until PASS.** Verify a bad secret → `res.status` 401 and no token (add that assertion).

- [ ] **Step 6: Commit.**

```bash
git add apps/roebel-id/src/agents/client-source.ts apps/roebel-id/src/oidc/provider.ts apps/roebel-id/test/agent-token.test.ts apps/roebel-id/test/helpers/fake-client.ts apps/roebel-id/test/e2e-flow.test.ts
git commit -m "feat(roebel-id): agent client_credentials grant issues a JWT access token"
```

---

### Task 4: Delegation — `act`, `actor_type`, and scopes on the agent token

**Files:**
- Modify: `apps/roebel-id/src/oidc/provider.ts` (add `extraTokenClaims`)
- Test: `apps/roebel-id/test/agent-delegation.test.ts`

**Interfaces:**
- Produces: the JWT access token issued to an agent client now contains `roebel:actor_type:'agent'`, `act:{ sub: <agent.ownerSub> }`, `roebel:scopes: string[]`.

- [ ] **Step 1: Write the failing test** (extends Task 3's harness — reuse the same `beforeAll`; decode the JWT with `jose`).

```ts
// apps/roebel-id/test/agent-delegation.test.ts  (same beforeAll/afterAll as agent-token.test.ts)
import { decodeJwt } from 'jose'
it('stamps act + actor_type + scopes onto the agent token', async () => {
  const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
  const res = await fetch(`${issuer}/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
  const { access_token } = await res.json() as any
  const claims = decodeJwt(access_token)
  expect(claims.sub).toBe(AGENT)
  expect(claims['roebel:actor_type']).toBe('agent')
  expect((claims.act as any)?.sub).toBe(OWNER)
  expect(claims['roebel:scopes']).toContain('workspace:draft')
})
```

- [ ] **Step 2: Run it — expect FAIL** (claims absent).

- [ ] **Step 3: Add `extraTokenClaims` to the provider config.** For a `client_credentials` token whose client is a registered agent, look up the agent and return the extra claims.

```ts
// apps/roebel-id/src/oidc/provider.ts — add to Configuration (conform signature to panva v8):
async extraTokenClaims(ctx, token) {
  if ((token as any).gty !== 'client_credentials') return {}
  const agent = deps.agentReader ? await deps.agentReader(String(token.clientId).toLowerCase()) : null
  if (!agent || !agent.enabled) return {}
  return {
    sub: agent.address,
    'roebel:actor_type': 'agent',
    act: { sub: agent.ownerSub },
    'roebel:scopes': agent.scopes,
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Re-run `agent-token.test.ts` (still green).

- [ ] **Step 5: Commit.**

```bash
git add apps/roebel-id/src/oidc/provider.ts apps/roebel-id/test/agent-delegation.test.ts
git commit -m "feat(roebel-id): RFC 8693 act delegation + actor_type + scopes on agent token"
```

---

### Task 5: Audit log of agent token issuance

**Files:**
- Create: `apps/roebel-id/src/agents/audit.ts`
- Modify: `apps/roebel-id/src/oidc/provider.ts` (listen for issued access tokens), `apps/roebel-id/src/wire.ts`
- Test: `apps/roebel-id/test/agent-audit.test.ts`

**Interfaces:**
- Consumes: `AgentReader`, `AuditWriter` (Task 1 types).
- Produces: `createAuditWriter(client): AuditWriter`; on every agent `client_credentials` token issuance, one `id_agent_audit` row is written with `{ agent, act_sub, scopes, jti }`.

- [ ] **Step 1: Write the failing test** (reuse Task 3 harness; pass a spy `AuditWriter` into `buildProvider`, assert it was called).

```ts
// apps/roebel-id/test/agent-audit.test.ts (Task-3 beforeAll, but capture audit calls)
const audited: any[] = []
// in beforeAll: buildProvider({ ..., agentReader, auditWriter: async (e) => { audited.push(e) } })
it('writes one audit entry per agent token', async () => {
  const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
  await fetch(`${issuer}/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
  expect(audited).toHaveLength(1)
  expect(audited[0]).toMatchObject({ agent: AGENT, actSub: OWNER, scopes: ['workspace:draft'] })
})
```

- [ ] **Step 2: Run — expect FAIL** (no `auditWriter` dep).

- [ ] **Step 3: Implement the writer + wire the event.** Add `auditWriter?` to `buildProvider` deps; register `provider.on('access_token.saved', ...)` (confirm the exact v8 event name in the doc-check — candidates: `access_token.saved` / `access_token.issued`) to write audit rows for agent tokens.

```ts
// apps/roebel-id/src/agents/audit.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditWriter } from './types.js'
export function createAuditWriter(client: SupabaseClient): AuditWriter {
  return async ({ agent, actSub, scopes, jti }) => {
    const { error } = await client.from('id_agent_audit').insert({ agent, act_sub: actSub, scopes, jti })
    if (error) console.error('agent audit: insert failed', error) // never block token issuance on audit write
  }
}
// provider.ts (after `const provider = new Provider(...)`):
if (deps.agentReader && deps.auditWriter) {
  provider.on('access_token.saved', async (token: any) => {
    if (token?.gty !== 'client_credentials') return
    const agent = await deps.agentReader!(String(token.clientId).toLowerCase())
    if (!agent) return
    await deps.auditWriter!({ agent: agent.address, actSub: agent.ownerSub, scopes: agent.scopes, jti: token.jti })
  })
}
```

- [ ] **Step 4: Wire the real writer in `wire.ts`** — `const auditWriter = createAuditWriter(supabase)` and pass `agentReader` + `auditWriter` into `buildProvider`; also build `const agentReader = createAgentReader(supabase)` and pass into `createClaimsResolver`.

- [ ] **Step 5: Run — expect PASS.** `pnpm --filter @roebel/roebel-id build` (type-check the wiring).

- [ ] **Step 6: Commit.**

```bash
git add apps/roebel-id/src/agents/audit.ts apps/roebel-id/src/oidc/provider.ts apps/roebel-id/src/wire.ts apps/roebel-id/test/agent-audit.test.ts
git commit -m "feat(roebel-id): audit every agent token issuance"
```

---

### Task 6: Kill switch (end-to-end) + docs

**Files:**
- Test: `apps/roebel-id/test/agent-killswitch.test.ts`
- Modify: `apps/roebel-id/README.md` (agent-principal section), [`2026-07-25-sovereign-workplace-suite-design.md`](../specs/2026-07-25-sovereign-workplace-suite-design.md) (mark P3 identity/delegation slice ✅ in the build-order table)

**Interfaces:** none new — proves the kill switch across the wired provider.

- [ ] **Step 1: Write the failing test** — a disabled agent cannot mint a token. Reuse Task 3's harness but with a mutable `enabled` flag in the `agentReader`.

```ts
// apps/roebel-id/test/agent-killswitch.test.ts
let enabled = true
const agentReader: AgentReader = async (a) => a === AGENT
  ? { address: AGENT, ownerSub: OWNER, scopes: ['workspace:draft'], clientSecret: 'agent-secret', enabled } : null
// ...buildProvider({ ..., agentReader })
it('refuses a token once the agent is disabled', async () => {
  const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
  const call = () => fetch(`${issuer}/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent' }) })
  expect((await call()).status).toBe(200)          // enabled → ok
  enabled = false
  const res = await call()                          // disabled → invalid_client
  expect(res.status).toBe(401)
  expect((await res.json() as any).error).toBe('invalid_client')
})
```

- [ ] **Step 2: Run it.** It should PASS already if `agentClientFind` (Task 3) returns `undefined` for a disabled agent. If panva surfaces a different status/error code, adjust the assertion to panva's actual `invalid_client` response — do **not** weaken the guarantee (no token when disabled).

- [ ] **Step 3: Document.** Add an "Agent principals" section to `apps/roebel-id/README.md`: how to register an agent (`id_agents` row), request a token (`client_credentials`), read `act`/`actor_type`/`roebel:scopes`, and the kill switch. In the workplace-suite spec's build-order table, change the P3 row to note the **identity/delegation/audit slice is implemented** (Zodiac budget enforcement = P3b, MCP runtime = P3c remain).

- [ ] **Step 4: Run the full suite** — `pnpm --filter @roebel/roebel-id test` (all green) + `pnpm --filter @roebel/roebel-id build`.

- [ ] **Step 5: Commit.**

```bash
git add apps/roebel-id/test/agent-killswitch.test.ts apps/roebel-id/README.md docs/superpowers/specs/2026-07-25-sovereign-workplace-suite-design.md
git commit -m "feat(roebel-id): kill-switch e2e + agent-principal docs"
```

---

## Self-review

- **Spec coverage (proposal §4 L4 + keystone §10):** identity (Task 3, `sub`=agent) ✓ · delegation `act` RFC 8693 (Task 4) ✓ · non-interactive client-credentials grant (Task 3) ✓ · bounded scopes surfaced (Task 4, `roebel:scopes`) ✓ · audit (Task 5) ✓ · kill switch / governance revocation (Task 3 + Task 6) ✓ · `actor_type` reserved-seam now populated (Tasks 2 + 4) ✓. **Deliberately deferred** (stated in Global Constraints): Zodiac on-chain budget *enforcement* (only `budgetRef` is stored/surfaced here) and MCP tool execution.
- **Placeholder scan:** every code/test step has real content; the only "verify against panva v8" items are explicit doc-checks with the tests as the behavioural contract (legitimate, not placeholders).
- **Type consistency:** `Agent` shape identical across Tasks 1→6; `agentReader: AgentReader`, `auditWriter: AuditWriter` names consistent in `buildProvider` deps and `wire.ts`; token claim keys (`roebel:actor_type`, `act`, `roebel:scopes`) identical in producer (Task 4) and assertions (Task 4/5/6); `id_agents` columns match `createAgentReader`'s `select`.
```
