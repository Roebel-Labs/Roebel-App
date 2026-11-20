import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { exportJWK, generateKeyPair, jwtVerify, decodeProtectedHeader, type KeyLike } from 'jose'
import { createMiniAppTokenRouter } from '../src/miniapp/token-router.js'
import { createApp } from '../src/app.js'

const ISSUER = 'https://id.example'
const SECRET = 's'.repeat(40)
const APP = '11111111-2222-3333-4444-555555555555'
const NOW = 1_800_000_000

let publicKey: KeyLike
let jwks: { keys: object[] }
let app: express.Express

function appWith(secret: string | undefined) {
  return createApp({ miniappTokenRouter: createMiniAppTokenRouter({ issuer: ISSUER, secret, jwks, now: () => NOW }) })
}

const post = (a: express.Express, body: unknown, secret = SECRET) =>
  request(a).post('/internal/miniapp-token').set('Authorization', `Bearer ${secret}`).send(body as object)

beforeAll(async () => {
  const kp = await generateKeyPair('RS256', { extractable: true })
  publicKey = kp.publicKey
  jwks = { keys: [{ ...(await exportJWK(kp.privateKey)), kid: 'rsa-1', use: 'sig' }] }
  app = appWith(SECRET)
})

describe('POST /internal/miniapp-token', () => {
  it('signs a mini-app token that verifies against the public JWKS', async () => {
    const r = await post(app, { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 })
    expect(r.status).toBe(200)
    const { payload, protectedHeader } = await jwtVerify(r.body.token, publicKey, {
      issuer: ISSUER,
      audience: 'miniapp:demo',
      currentDate: new Date(NOW * 1000),
    })
    expect(protectedHeader.typ).toBe('miniapp+jwt')
    expect(protectedHeader.alg).toBe('RS256')
    expect(protectedHeader.kid).toBe('rsa-1')
    expect(payload.sub).toBe('nz_x')
    expect(payload.app).toBe(APP)
    expect(payload.v).toBe(1)
    expect(payload.exp).toBe(NOW + 600)
    expect(r.body.expiresAt).toBe(NOW + 600)
  })

  it('carries the granted claims', async () => {
    const creds = [{ type: 'citizen', recognised: true }]
    const r = await post(app, {
      claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1, addr: '0xabc', name: 'Erika', picture: 'https://x/p.png', creds },
      exp: NOW + 600,
    })
    expect(r.status).toBe(200)
    const { payload } = await jwtVerify(r.body.token, publicKey, { currentDate: new Date(NOW * 1000) })
    expect(payload.addr).toBe('0xabc')
    expect(payload.name).toBe('Erika')
    expect(payload.picture).toBe('https://x/p.png')
    expect(payload.creds).toEqual(creds)
  })

  it('refuses an audience that is not a mini app', async () => {
    for (const aud of ['nextcloud', 'miniapp:', 'miniapp:Demo', 'miniapp:-x', ['miniapp:demo', 'nextcloud']]) {
      const r = await post(app, { claims: { aud, sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 })
      expect(r.status).toBe(400)
    }
  })

  it('refuses a wrong secret', async () => {
    const r = await post(app, { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 }, 'w'.repeat(40))
    expect(r.status).toBe(401)
    const none = await request(app).post('/internal/miniapp-token').send({})
    expect(none.status).toBe(401)
  })

  it('answers 404 when no secret is configured', async () => {
    const r = await post(appWith(undefined), { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 })
    expect(r.status).toBe(404)
  })

  it('refuses a lifetime over 900 s and an expiry in the past', async () => {
    const claims = { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }
    expect((await post(app, { claims, exp: NOW + 901 })).status).toBe(400)
    expect((await post(app, { claims, exp: NOW - 1 })).status).toBe(400)
    expect((await post(app, { claims, exp: NOW + 900 })).status).toBe(200)
  })

  it('refuses v other than 1, a missing sub or app, and a body over 8 KB', async () => {
    expect((await post(app, { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 2 }, exp: NOW + 600 })).status).toBe(400)
    expect((await post(app, { claims: { aud: 'miniapp:demo', app: APP, v: 1 }, exp: NOW + 600 })).status).toBe(400)
    expect((await post(app, { claims: { aud: 'miniapp:demo', sub: 'nz_x', v: 1 }, exp: NOW + 600 })).status).toBe(400)
    const big = await post(app, { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1, name: 'x'.repeat(9000) }, exp: NOW + 600 })
    expect(big.status).toBe(400)
  })

  it('ignores iss, iat and jti sent by the caller', async () => {
    const r = await post(app, {
      claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1, iss: 'https://evil', iat: 1, jti: 'mine' },
      exp: NOW + 600,
    })
    expect(r.status).toBe(200)
    const { payload } = await jwtVerify(r.body.token, publicKey, { issuer: ISSUER, currentDate: new Date(NOW * 1000) })
    expect(payload.iss).toBe(ISSUER)
    expect(payload.iat).toBe(NOW)
    expect(payload.jti).not.toBe('mine')
    expect(typeof payload.jti).toBe('string')
    expect(decodeProtectedHeader(r.body.token).typ).toBe('miniapp+jwt')
  })

  it('signs with the first RS256/ES256 key, skipping keys the node cannot verify', async () => {
    const ed = await generateKeyPair('EdDSA', { extractable: true })
    const es = await generateKeyPair('ES256', { extractable: true })
    const mixed = {
      keys: [
        { ...(await exportJWK(ed.privateKey)), kid: 'ed-1' },
        { ...(await exportJWK(es.privateKey)), kid: 'es-1' },
      ],
    }
    const a = createApp({ miniappTokenRouter: createMiniAppTokenRouter({ issuer: ISSUER, secret: SECRET, jwks: mixed, now: () => NOW }) })
    const r = await post(a, { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 })
    expect(r.status).toBe(200)
    const { protectedHeader } = await jwtVerify(r.body.token, es.publicKey, { currentDate: new Date(NOW * 1000) })
    expect(protectedHeader.alg).toBe('ES256')
    expect(protectedHeader.kid).toBe('es-1')
  })

  it('answers 503 with a clear error when no RS256/ES256 key is configured', async () => {
    const ed = await generateKeyPair('EdDSA', { extractable: true })
    const only = { keys: [{ ...(await exportJWK(ed.privateKey)), kid: 'ed-1' }] }
    const a = createApp({ miniappTokenRouter: createMiniAppTokenRouter({ issuer: ISSUER, secret: SECRET, jwks: only, now: () => NOW }) })
    const r = await post(a, { claims: { aud: 'miniapp:demo', sub: 'nz_x', app: APP, v: 1 }, exp: NOW + 600 })
    expect(r.status).toBe(503)
    expect(r.body.error).toBe('no_signing_key')
    expect(r.body.message).toMatch(/RS256|ES256/)
  })
})
