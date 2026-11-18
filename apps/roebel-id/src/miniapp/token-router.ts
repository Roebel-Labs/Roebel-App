import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { SignJWT, importJWK, type JWK, type KeyLike } from 'jose'

// Mini-app user tokens signed for the node (plan miniapp-2, Task 8). The node decides what
// goes into a token (grants, pseudonym, credentials); this service only signs it with the
// community's key, so a mini app's own server can verify it against the public JWKS.
//
// Guard rails: the audience must be `miniapp:<slug>` and the header `typ` is always
// `miniapp+jwt`, so a token from this path can never pass as an OIDC id or access token;
// `iss`, `iat` and `jti` are set here, never taken from the caller.

export const MINIAPP_TOKEN_TYP = 'miniapp+jwt'
const AUD_RE = /^miniapp:[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
const MAX_LIFETIME_SEC = 900
const BODY_LIMIT = '8kb'

type Signer = { key: KeyLike | Uint8Array; alg: string; kid?: string }

function sameSecret(a: string, b: string): boolean {
  // Hash first so both buffers have the same length; compare in constant time.
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

function defaultAlg(jwk: Record<string, unknown>): string | undefined {
  if (typeof jwk.alg === 'string') return jwk.alg
  if (jwk.kty === 'RSA') return 'RS256'
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256'
  if (jwk.kty === 'EC' && jwk.crv === 'P-384') return 'ES384'
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA'
  return undefined
}

function bad(res: express.Response, message: string) {
  res.status(400).json({ error: 'invalid_request', message })
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export function createMiniAppTokenRouter(deps: {
  issuer: string
  secret: string | undefined
  jwks: { keys: object[] }
  now?: () => number
}): express.Router {
  const router = express.Router()
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000))
  let signer: Promise<Signer | null> | undefined

  const getSigner = () =>
    (signer ??= (async () => {
      const jwk = deps.jwks.keys[0] as Record<string, unknown> | undefined
      if (!jwk) return null
      const alg = defaultAlg(jwk)
      if (!alg) return null
      const key = await importJWK(jwk as unknown as JWK, alg)
      return { key, alg, ...(typeof jwk.kid === 'string' ? { kid: jwk.kid } : {}) }
    })().catch((e) => {
      signer = undefined
      throw e
    }))

  router.post(
    '/internal/miniapp-token',
    (req, res, next) => {
      // No secret configured: the path does not exist on this instance.
      if (!deps.secret) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      const auth = req.get('authorization') ?? ''
      const m = /^Bearer\s+(.+)$/i.exec(auth)
      if (!m || !sameSecret(m[1].trim(), deps.secret)) {
        res.status(401).json({ error: 'unauthorized' })
        return
      }
      next()
    },
    express.json({ limit: BODY_LIMIT }),
    async (req, res, next) => {
      try {
        const body = req.body as { claims?: Record<string, unknown>; exp?: unknown } | undefined
        const c = body?.claims
        if (!c || typeof c !== 'object' || Array.isArray(c)) return bad(res, 'claims missing')
        if (typeof c.aud !== 'string' || !AUD_RE.test(c.aud)) return bad(res, 'aud must be miniapp:<slug>')
        if (c.v !== 1) return bad(res, 'v must be 1')
        if (!isStr(c.sub) || !isStr(c.app)) return bad(res, 'sub and app are required')
        const t = now()
        const exp = body?.exp
        if (typeof exp !== 'number' || !Number.isInteger(exp) || exp <= t || exp > t + MAX_LIFETIME_SEC) {
          return bad(res, `exp must be in the future and at most ${MAX_LIFETIME_SEC} s ahead`)
        }
        if (c.addr !== undefined && typeof c.addr !== 'string') return bad(res, 'addr must be a string')
        if (c.name !== undefined && typeof c.name !== 'string') return bad(res, 'name must be a string')
        if (c.picture !== undefined && typeof c.picture !== 'string') return bad(res, 'picture must be a string')
        if (c.creds !== undefined && !Array.isArray(c.creds)) return bad(res, 'creds must be an array')

        const s = await getSigner()
        if (!s) {
          res.status(503).json({ error: 'no_signing_key' })
          return
        }
        // Only the known claims; iss/iat/jti from the caller are ignored.
        const payload: Record<string, unknown> = { app: c.app, v: 1 }
        if (c.addr !== undefined) payload.addr = c.addr
        if (c.name !== undefined) payload.name = c.name
        if (c.picture !== undefined) payload.picture = c.picture
        if (c.creds !== undefined) payload.creds = c.creds
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: s.alg, typ: MINIAPP_TOKEN_TYP, ...(s.kid ? { kid: s.kid } : {}) })
          .setIssuer(deps.issuer)
          .setAudience(c.aud)
          .setSubject(c.sub)
          .setIssuedAt(t)
          .setExpirationTime(exp)
          .setJti(randomUUID())
          .sign(s.key)
        res.json({ token, expiresAt: exp })
      } catch (e) {
        next(e)
      }
    },
  )

  // Body-parser errors (too large, not JSON) are a bad request on this path, not a 413/500.
  router.use('/internal/miniapp-token', ((err, _req, res, next) => {
    const status = (err as { status?: number })?.status
    if (status === 413 || status === 400) {
      bad(res, status === 413 ? 'body larger than 8 KB' : 'body is not valid JSON')
      return
    }
    next(err)
  }) as express.ErrorRequestHandler)

  return router
}
