import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPair, exportJWK, decodeJwt } from 'jose'
import { buildProvider } from '../src/oidc/provider.js'
import { createApp } from '../src/app.js'
import { createInteractionRouter } from '../src/interaction/router.js'
import { makeSupabaseAdapterFactory } from '../src/store/supabase-adapter.js'
import { fakeClient } from './helpers/fake-client.js'
import type { AgentReader } from '../src/agents/types.js'

// Task 4 behavioural contract: the JWT access token issued to an enabled agent via the
// client_credentials grant carries the delegation claims — `roebel:actor_type:'agent'`,
// `act:{ sub: <owner> }` (RFC 8693 delegation), and `roebel:scopes:<granted scopes>` — while its
// `sub` remains the agent address. Same in-process panva harness as agent-token.test.ts.

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

describe('agent delegation claims', () => {
  it('stamps act + actor_type + scopes onto the agent token', async () => {
    const basic = Buffer.from(`${AGENT}:agent-secret`).toString('base64')
    const res = await fetch(`${issuer}/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
    expect(res.status).toBe(200)
    const { access_token } = await res.json() as { access_token: string }
    const claims = decodeJwt(access_token)
    expect(claims.sub).toBe(AGENT)
    expect(claims['roebel:actor_type']).toBe('agent')
    expect((claims.act as { sub?: string } | undefined)?.sub).toBe(OWNER)
    expect(claims['roebel:scopes']).toContain('workspace:draft')
  })
})
