import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPair, exportJWK } from 'jose'
import { buildProvider } from '../src/oidc/provider.js'
import { createApp } from '../src/app.js'
import { createInteractionRouter } from '../src/interaction/router.js'
import { makeSupabaseAdapterFactory } from '../src/store/supabase-adapter.js'
import { fakeClient } from './helpers/fake-client.js'
import type { AgentReader, AuditEntry } from '../src/agents/types.js'

// Task 5 behavioural contract: every successful agent client_credentials token issuance writes
// exactly one audit entry (agent, act.sub, granted scopes, jti) through the injected AuditWriter.
// Same in-process panva harness as agent-token.test.ts (Task 3), with a spy AuditWriter wired into
// buildProvider instead of the real Supabase-backed createAuditWriter.

const AGENT = '0xa9e70000000000000000000000000000000000a1'
const OWNER = '0x0000000000000000000000000000000000000owner'.toLowerCase()
const agentReader: AgentReader = async (a) => a === AGENT
  ? { address: AGENT, ownerSub: OWNER, displayName: 'Mecky', scopes: ['workspace:draft'], clientSecret: 'agent-secret', enabled: true } : null

const audited: AuditEntry[] = []

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
    auditWriter: async (entry) => { audited.push(entry) },
    adapterFactory: makeSupabaseAdapterFactory({ client: fakeClient() as any }),
    resolveClaims: async (a) => ({ sub: a, groups: ['agent'], 'roebel:citizen': false, 'roebel:attester': false, 'roebel:actor_type': 'agent' }) })
  const app = createApp({ provider, interactionRouter: createInteractionRouter({ provider, bridge: { issueNonce: () => 'n', verifyLogin: async () => ({ address: AGENT }) } as any, thirdwebClientId: 't', chainId: 100 }) })
  server.on('request', app)
}, 30000)
afterAll(async () => { if (server) await new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections?.() }) })

describe('agent token issuance audit trail', () => {
  it('writes one audit entry per agent token', async () => {
    const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
    const res = await fetch(`${issuer}/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
    expect(res.status).toBe(200)
    expect(audited).toHaveLength(1)
    expect(audited[0]).toMatchObject({ agent: AGENT, actSub: OWNER, scopes: ['workspace:draft'] })
    expect(typeof audited[0].jti).toBe('string')
    expect(audited[0].jti).not.toHaveLength(0)
  })

  it('writes no audit entry for a rejected (bad-secret) request', async () => {
    audited.length = 0
    const basic = Buffer.from(`${AGENT}:wrong-secret`).toString('base64')
    const res = await fetch(`${issuer}/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
    expect(res.status).toBe(401)
    expect(audited).toHaveLength(0)
  })
})

// Fix round 1 (Critical): the `client_credentials.issued` listener in provider.ts is a
// fire-and-forget EventEmitter callback — Node never awaits/catches async listener rejections, and
// this app installs no process-wide `unhandledRejection` handler. Anything unguarded inside that
// listener (originally: the `agentReader(...)` lookup, which `createAgentReader` — src/agents/
// reader.ts — deliberately THROWS from on a real Supabase query error, plus the `auditWriter(...)`
// call and every await between them) could turn a transient audit-side read/write failure into an
// unhandled rejection that crashes the whole roebel-id process, taking down unrelated Nextcloud
// logins with it. This suite proves the fix (a single try/catch wrapping the whole listener body):
// an audit-side failure must (a) still let the token request succeed with 200, and (b) never
// surface as a process-level unhandled rejection.
describe('agent token issuance audit trail — audit-path failure resilience', () => {
  let failServer: Server, failIssuer: string
  const unhandled: unknown[] = []
  const onUnhandledRejection = (reason: unknown) => { unhandled.push(reason) }

  beforeAll(async () => {
    process.on('unhandledRejection', onUnhandledRejection)
    const { privateKey } = await generateKeyPair('RS256', { extractable: true })
    const jwk = await exportJWK(privateKey); jwk.kid = 'k1'; jwk.use = 'sig'; jwk.alg = 'RS256'
    process.env.JWKS_JSON = JSON.stringify({ keys: [jwk] })
    failServer = createServer(); await new Promise<void>((r) => failServer.listen(0, '127.0.0.1', () => r()))
    failIssuer = `http://localhost:${(failServer.address() as AddressInfo).port}`
    const config: any = { issuer: failIssuer, cookieKeys: ['k'], chainId: 100, thirdwebClientId: 't',
      nextcloud: { clientId: 'nextcloud', clientSecret: 'secret', redirectUris: [`${failIssuer}/cb`], postLogoutRedirectUris: [] } }
    // agentReader resolves fine everywhere (client auth, resource-server, extraTokenClaims all
    // succeed — the token request itself must not be affected). The audit-side failure is
    // simulated by a rejecting auditWriter: it lands on the exact same unguarded `await` chain a
    // throwing agentReader would (both sit inside the one try/catch added in provider.ts), so this
    // genuinely exercises the fix without coupling the test to how many times agentReader happens
    // to be called internally before the listener runs.
    const provider = buildProvider({ config, agentReader,
      auditWriter: async () => { throw new Error('simulated audit-side Supabase failure') },
      adapterFactory: makeSupabaseAdapterFactory({ client: fakeClient() as any }),
      resolveClaims: async (a) => ({ sub: a, groups: ['agent'], 'roebel:citizen': false, 'roebel:attester': false, 'roebel:actor_type': 'agent' }) })
    const app = createApp({ provider, interactionRouter: createInteractionRouter({ provider, bridge: { issueNonce: () => 'n', verifyLogin: async () => ({ address: AGENT }) } as any, thirdwebClientId: 't', chainId: 100 }) })
    failServer.on('request', app)
  }, 30000)
  afterAll(async () => {
    process.off('unhandledRejection', onUnhandledRejection)
    if (failServer) await new Promise<void>((r) => { failServer.close(() => r()); failServer.closeAllConnections?.() })
  })

  it('still issues a 200 token, and the audit-write failure never escapes as an unhandled rejection', async () => {
    const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
    const res = await fetch(`${failIssuer}/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
    expect(res.status).toBe(200)
    const body = await res.json() as { access_token: string }
    expect(body.access_token.split('.').length).toBe(3) // JWT still issued

    // The listener's rejection is caught asynchronously, slightly after the HTTP response is
    // flushed — give the microtask/macrotask queue a beat to settle before asserting nothing leaked.
    await new Promise((r) => setTimeout(r, 50))
    expect(unhandled).toHaveLength(0)
  })
})
