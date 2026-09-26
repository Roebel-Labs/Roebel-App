import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

// Passkeys of the Röbel app live on the neutral Ortis identity domain (rpId id.ortis.app).
// iOS only accepts that rpId when the domain's apple-app-site-association lists the app under
// `webcredentials`; Android needs `get_login_creds` in the domain's assetlinks.json. Both must
// be served as plain JSON with a 200 and no redirect.
const APP_ID = '88879TXSXK.com.maxbrych.roebelonchain'
const PACKAGE = 'com.maxbrych.roebelonchain'
const FINGERPRINT =
  '9A:7C:6B:92:D0:D2:41:71:F2:5F:4C:19:B0:7A:D2:56:52:38:EB:ED:30:A4:52:AC:65:81:1D:98:97:09:CB:AC'

// Stand-in for panva's provider: its catch-all answers every path it does not know with 404.
const catchAllProvider = { callback: () => (_req: unknown, res: any) => res.status(404).json({ error: 'invalid_request' }) }

describe('app associations for passkeys', () => {
  it('serves apple-app-site-association with the webcredentials app id', async () => {
    const res = await request(createApp({ provider: catchAllProvider as any })).get(
      '/.well-known/apple-app-site-association',
    )
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^application\/json/)
    expect(res.body).toEqual({ webcredentials: { apps: [APP_ID] } })
  })

  it('serves assetlinks.json granting URL handling and login credentials to the Android app', async () => {
    const res = await request(createApp({ provider: catchAllProvider as any })).get('/.well-known/assetlinks.json')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^application\/json/)
    expect(res.body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
        target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: [FINGERPRINT] },
      },
    ])
  })
})
