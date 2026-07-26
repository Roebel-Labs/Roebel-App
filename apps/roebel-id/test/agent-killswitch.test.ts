import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPair, exportJWK } from 'jose'
import { buildProvider } from '../src/oidc/provider.js'
import { createApp } from '../src/app.js'
import { createInteractionRouter } from '../src/interaction/router.js'
import { makeSupabaseAdapterFactory } from '../src/store/supabase-adapter.js'
import { fakeClient } from './helpers/fake-client.js'
import type { AgentReader } from '../src/agents/types.js'

// Task 6 behavioural contract (end-to-end kill switch): a governance decision to disable an agent
// — flipping `id_agents.enabled` to false — must stop that agent from minting any further
// client_credentials token, with no code change and no restart. This test proves it across the
// real wired provider (Task 3's agentClientFind + Task 3's getResourceServerInfo guard) rather than
// at the unit level: the SAME agent, same secret, same request is issued twice against the SAME
// long-lived provider instance, with only the registry's `enabled` flag flipped in between.
//
// `enabled` is a mutable module-level flag closed over by `agentReader`, standing in for a
// Supabase row flip (UPDATE id_agents SET enabled = false WHERE address = ...) without a real DB.

const AGENT = '0xa9e70000000000000000000000000000000000a1'
const OWNER = '0x0000000000000000000000000000000000000owner'.toLowerCase()
let enabled = true
const agentReader: AgentReader = async (a) => a === AGENT
  ? { address: AGENT, ownerSub: OWNER, displayName: 'Mecky', scopes: ['workspace:draft'], clientSecret: 'agent-secret', enabled } : null

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

describe('agent kill switch (end-to-end)', () => {
  it('mints a token while enabled, then refuses the identical request once disabled', async () => {
    const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
    const call = () => fetch(`${issuer}/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent' }) })

    // enabled=true → agentClientFind resolves the agent's client metadata → token issued.
    const okRes = await call()
    expect(okRes.status).toBe(200)
    const okBody = await okRes.json() as { access_token?: string; token_type?: string }
    expect(okBody.access_token?.split('.').length).toBe(3) // JWT

    // Flip the registry — the only thing that changes is `enabled`; client_id, secret, and the
    // provider instance are all identical to the request above.
    enabled = false

    // enabled=false → agentClientFind's `!agent.enabled` branch returns undefined → panva's
    // client_secret_basic auth treats the client_id as non-existent. panva 8.8.1 surfaces this as
    // a 401 with error `invalid_client` (verified against the installed provider, matching Task 3's
    // agent-token.test.ts assertion for an unknown/rejected client) — asserted directly, not
    // weakened to "any 4xx".
    const deniedRes = await call()
    expect(deniedRes.status).toBe(401)
    const deniedBody = await deniedRes.json() as { access_token?: string; error?: string }
    expect(deniedBody.error).toBe('invalid_client')
    expect(deniedBody.access_token).toBeUndefined()
  })
})
