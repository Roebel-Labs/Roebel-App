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

// Task 3 behavioural contract: an enabled agent registered in id_agents authenticates
// non-interactively via the client_credentials grant and receives a JWT access token; a wrong
// secret is rejected with 401 and no token. The provider is the real panva oidc-provider stood up
// in-process on an ephemeral port (same harness as e2e-flow), with a stub AgentReader standing in
// for the Supabase-backed registry.

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

describe('agent client_credentials grant', () => {
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

  it('rejects a bad secret with 401 and issues no token', async () => {
    const basic = Buffer.from(`${AGENT}:wrong-secret`).toString('base64')
    const res = await fetch(`${issuer}/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'roebel:agent workspace:draft' }) })
    expect(res.status).toBe(401)
    const body = await res.json() as { access_token?: string; error?: string }
    expect(body.access_token).toBeUndefined()
    expect(body.error).toBe('invalid_client')
  })

  // Security guard (Fix round 1): the agent JWT resource must not be reachable by a non-agent
  // client. `roebel:agent` is a global scope and the Nextcloud static client declares no per-client
  // scope allow-list, so without this guard Nextcloud could drive an authorization_code request
  // with scope=roebel:agent + resource=${issuer}/agent and mint a JWT with aud=${issuer}/agent.
  // getResourceServerInfo now rejects any caller that is not an enabled agent on the
  // client_credentials grant with invalid_target — so the request is refused before any
  // authorization code / agent-audience token can be produced.
  it('rejects a non-agent client requesting the agent resource (no privilege escalation)', async () => {
    const params = new URLSearchParams({
      client_id: 'nextcloud',
      response_type: 'code',
      scope: 'openid roebel:agent',
      redirect_uri: `${issuer}/cb`,
      resource: `${issuer}/agent`,
      // Any well-formed S256 challenge — PKCE is verified at token exchange, which is never reached.
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      state: 'guard-xyz',
    })
    const res = await fetch(`${issuer}/auth?${params.toString()}`, { redirect: 'manual' })
    const location = res.headers.get('location') ?? ''
    const bodyText = res.status >= 400 ? await res.text() : ''
    // Refused (invalid_target), whether surfaced as an error redirect to the RP or a 4xx body.
    expect(
      location.includes('error=invalid_target') || bodyText.includes('invalid_target'),
    ).toBe(true)
    // No authorization code is ever issued, so no agent-audience JWT can follow.
    expect(location).not.toContain('code=')
  })
})
