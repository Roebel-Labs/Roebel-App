import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPair, exportJWK } from 'jose'
import { Issuer, generators, type Client } from 'openid-client'
import { buildProvider } from '../src/oidc/provider.js'
import { createInteractionRouter } from '../src/interaction/router.js'
import { createApp } from '../src/app.js'
import { makeSupabaseAdapterFactory } from '../src/store/supabase-adapter.js'
import type { AuthBridge } from '../src/auth-bridge/types.js'

// End-to-end IdP-conformance proof (spec §8.1): stand up the real oidc-provider + interaction
// router in-process on an ephemeral port, then drive a full authorization_code + PKCE flow with
// openid-client v5 acting as the Nextcloud RP. The Gnosis verifier / SIWE path is bypassed by a
// STUB AuthBridge whose verifyLogin resolves a fixed address directly, and a STUB resolveClaims
// returns fixed Röbel claims. The point of the test is to prove that after login the id_token
// carries the scope-derived claims (groups, roebel:actor_type) — which only happens because the
// provider sets `conformIdTokenClaims: false` (otherwise those claims would only be reachable via
// the userinfo endpoint in the code flow, and Nextcloud reads groups straight off the id_token).

// Minimal in-memory fake of the supabase query surface the oidc adapter uses (one shared `rows`
// array backs every oidc payload type — Session, Interaction, Grant, AuthorizationCode, …). Copied
// from test/supabase-adapter.test.ts so the whole flow persists state within a single process.
function fakeClient() {
  const rows: any[] = []
  return {
    _rows: rows,
    from() {
      const state: any = { filters: {} }
      const api: any = {
        upsert(r: any) {
          const i = rows.findIndex((x) => x.type === r.type && x.id === r.id)
          if (i >= 0) rows[i] = r
          else rows.push(r)
          return Promise.resolve({ error: null })
        },
        select() { return api },
        eq(k: string, v: any) { state.filters[k] = v; return api },
        maybeSingle() {
          return Promise.resolve({
            data: rows.find((x) => Object.entries(state.filters).every(([k, v]) => x[k] === v)) ?? null,
            error: null,
          })
        },
        delete() { state.del = true; return api },
        then(res: any) {
          const matched = rows.filter((x) => Object.entries(state.filters).every(([k, v]) => x[k] === v))
          for (const m of matched) rows.splice(rows.indexOf(m), 1)
          return Promise.resolve({ error: null }).then(res)
        },
      }
      return api
    },
  }
}

// Cookie jar: oidc-provider hands out several path-scoped, sometimes-signed cookies
// (_session, _interaction, _interaction_resume, plus .sig/.legacy companions). A real browser
// would carry them between the authorize redirect and the interaction POST; the test global fetch
// does not, so we capture every Set-Cookie by name (via Headers.getSetCookie) and replay them all
// on every request. Empty values = deletions.
function makeJar() {
  const store = new Map<string, string>()
  return {
    apply(res: Response) {
      for (const sc of res.headers.getSetCookie()) {
        const first = sc.split(';')[0]
        const eq = first.indexOf('=')
        if (eq < 0) continue
        const name = first.slice(0, eq).trim()
        const value = first.slice(eq + 1).trim()
        if (value === '') store.delete(name)
        else store.set(name, value)
      }
    },
    header() {
      return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    },
  }
}

const ADDRESS = '0x4444444444444444444444444444444444444444'

let server: Server
let issuer: string
let redirectUri: string
let client: Client

beforeAll(async () => {
  // Real RS256 JWKS (same approach as test/discovery.test.ts) — panva refuses to construct without
  // a usable signing key, and openid-client validates the id_token signature against jwks_uri.
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(privateKey)
  jwk.kid = 'e2e-key-1'
  jwk.use = 'sig'
  jwk.alg = 'RS256'
  process.env.JWKS_JSON = JSON.stringify({ keys: [jwk] })

  // Bind an ephemeral port FIRST so the issuer (which is baked into the provider at construction)
  // matches the URL the server actually listens on. We attach the express app as the request
  // handler afterwards via server.on('request', app).
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port
  issuer = `http://localhost:${port}`
  redirectUri = `${issuer}/callback`

  const config: any = {
    issuer,
    cookieKeys: ['e2e-cookie-key'],
    chainId: 100,
    thirdwebClientId: 'test-client',
    nextcloud: {
      clientId: 'nextcloud',
      clientSecret: 'secret',
      redirectUris: [redirectUri],
      postLogoutRedirectUris: [],
    },
  }

  const provider = buildProvider({
    config,
    adapterFactory: makeSupabaseAdapterFactory({ client: fakeClient() as any }),
    resolveClaims: async (address) => ({
      sub: address,
      groups: ['citizen', 'attester'],
      'roebel:citizen': true,
      'roebel:attester': true,
      'roebel:actor_type': 'human',
    }),
  })

  const bridge: AuthBridge = {
    issueNonce: () => 'stubnonce0000000000',
    verifyLogin: async () => ({ address: ADDRESS }),
  }

  const interactionRouter = createInteractionRouter({
    provider,
    bridge,
    thirdwebClientId: 'test-client',
    chainId: 100,
  })
  const app = createApp({ provider, interactionRouter })
  server.on('request', app)

  const issuerObj = await Issuer.discover(issuer)
  client = new issuerObj.Client({
    client_id: 'nextcloud',
    client_secret: 'secret',
    redirect_uris: [redirectUri],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
  })
}, 30000)

afterAll(async () => {
  // ALWAYS release the listener — a live server (and undici keep-alive sockets) would keep the
  // vitest process alive and stall the run. closeAllConnections forces lingering sockets shut so
  // server.close's callback actually fires.
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
  }
})

describe('e2e authorization_code flow', () => {
  it(
    'completes authorization_code flow and returns roebel claims in the id_token',
    async () => {
      const jar = makeJar()
      // Never follow redirects automatically — we assert and route each hop by hand so the flow
      // can never spin in an unbounded redirect loop.
      const req = async (url: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers)
        const cookie = jar.header()
        if (cookie) headers.set('cookie', cookie)
        const res = await fetch(url, { ...init, headers, redirect: 'manual' })
        jar.apply(res)
        return res
      }

      const codeVerifier = generators.codeVerifier()
      const codeChallenge = generators.codeChallenge(codeVerifier)
      const state = generators.state()
      const nonce = generators.nonce()

      const authUrl = client.authorizationUrl({
        scope: 'openid email profile roebel',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      })

      // Bounded driver: seed with the authorize URL and walk redirects manually. Each hop is one
      // of: (a) the RP callback (contains the code → done), (b) an /interaction/:uid prompt (render
      // the login page, then POST login — the router also grants consent in that same POST), or
      // (c) a provider resume URL to follow. Hard cap of 8 hops guarantees termination.
      let code: string | undefined
      let callbackParams: Record<string, string> = {}
      let current = authUrl

      for (let hop = 0; hop < 8 && !code; hop++) {
        const url = new URL(current)

        if (current.startsWith(redirectUri)) {
          url.searchParams.forEach((v, k) => { callbackParams[k] = v })
          code = callbackParams.code
          break
        }

        if (url.pathname.startsWith('/interaction/')) {
          const uid = url.pathname.split('/')[2]

          // The German login page is served for the login (and consent) prompt.
          const pageRes = await req(current)
          expect(pageRes.status).toBe(200)
          const pageBody = await pageRes.text()
          expect(pageBody).toContain('Mit Röbel anmelden')

          // POST the (stubbed) SIWE result. The router verifies via the stub bridge, then creates
          // and saves a Grant covering the requested scopes and finishes with { login, consent }.
          const loginRes = await req(`${issuer}/interaction/${uid}/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: 'stub-siwe-message', signature: '0xstub' }),
          })
          expect(loginRes.status).toBe(200)
          const body = (await loginRes.json()) as { redirectTo: string }
          expect(body.redirectTo).toBeTruthy()
          current = new URL(body.redirectTo, issuer).toString()
          continue
        }

        // Provider resume URL (or the initial /auth request): follow the redirect it emits.
        const res = await req(current)
        const location = res.headers.get('location')
        if (!location) {
          throw new Error(
            `expected a redirect at ${current} but got ${res.status}: ${await res.text()}`,
          )
        }
        current = new URL(location, issuer).toString()
      }

      expect(code, 'authorization code was never issued').toBeTruthy()

      const tokenSet = await client.callback(redirectUri, callbackParams, {
        code_verifier: codeVerifier,
        state,
        nonce,
      })

      const claims = tokenSet.claims()
      // sub is the fixed lowercased address the stub bridge authenticated.
      expect(claims.sub).toBe(ADDRESS)
      // groups + roebel:actor_type ride in the id_token purely because conformIdTokenClaims:false.
      expect(claims.groups).toBeDefined()
      expect(claims.groups).toContain('citizen')
      expect(claims.groups).toContain('attester')
      expect(claims['roebel:actor_type']).toBe('human')
    },
    30000,
  )
})
