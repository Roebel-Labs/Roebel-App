import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { generateKeyPair, exportJWK } from 'jose'
import { buildProvider } from '../src/oidc/provider.js'
import { makeSupabaseAdapterFactory } from '../src/store/supabase-adapter.js'

const config: any = {
  issuer: 'http://localhost:3010', cookieKeys: ['k1'], chainId: 100,
  nextcloud: { clientId: 'nextcloud', clientSecret: 'secret', redirectUris: ['http://localhost:8080/apps/user_oidc/code'], postLogoutRedirectUris: [] },
}

// panva's oidc-provider requires a usable (non-empty) RS256 signing key even in tests — it
// throws at construction time if `jwks.keys` is empty. Generate a throwaway RSA keypair with
// `jose` (already a transitive dependency of `oidc-provider`, and needed again by Task 8's
// generate-jwks script) and export its private JWK into JWKS_JSON before building the provider.
beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(privateKey)
  jwk.kid = 'test-key-1'
  jwk.use = 'sig'
  jwk.alg = 'RS256'
  process.env.JWKS_JSON = JSON.stringify({ keys: [jwk] })
})

function memClient() { const rows: any[] = []; return { from() { const s: any = {}; const api: any = { upsert(r: any){rows.push(r);return Promise.resolve({error:null})}, select(){return api}, eq(k: string,v: any){s[k]=v;return api}, maybeSingle(){return Promise.resolve({data:null,error:null})}, delete(){return api}, then(res: any){return Promise.resolve({error:null}).then(res)} }; return api } } }

describe('discovery', () => {
  it('serves openid-configuration with the issuer', async () => {
    const provider = buildProvider({
      config,
      adapterFactory: makeSupabaseAdapterFactory({ client: memClient() as any }),
      resolveClaims: async (a) => ({ sub: a, groups: [], 'roebel:citizen': false, 'roebel:attester': false }),
    })
    const app = express()
    app.use('/oidc', provider.callback())
    const res = await request(app).get('/oidc/.well-known/openid-configuration')
    expect(res.status).toBe(200)
    expect(res.body.issuer).toBe('http://localhost:3010')
    expect(res.body.authorization_endpoint).toContain('/auth')
  })
})
