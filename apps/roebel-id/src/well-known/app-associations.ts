import express from 'express'

// The Röbel app's passkeys use the neutral Ortis identity domain as their WebAuthn rpId
// (id.ortis.app, served by the `ortis-id` Fly app from this codebase). The platforms only let
// a native app create/use passkeys for a domain that vouches for the app:
//   - iOS: /.well-known/apple-app-site-association lists the app under `webcredentials`
//     (paired with `webcredentials:id.ortis.app` in the app's associatedDomains).
//   - Android: /.well-known/assetlinks.json grants the app `get_login_creds`.
// Both files must be answered with 200 + application/json and no redirect.

/** Apple Team ID + bundle identifier of the Röbel app. */
export const IOS_APP_ID = '88879TXSXK.com.maxbrych.roebelonchain'
export const ANDROID_PACKAGE = 'com.maxbrych.roebelonchain'
/** Play App Signing certificate (same as roebel.app's assetlinks.json). */
export const ANDROID_SHA256_CERT_FINGERPRINT =
  '9A:7C:6B:92:D0:D2:41:71:F2:5F:4C:19:B0:7A:D2:56:52:38:EB:ED:30:A4:52:AC:65:81:1D:98:97:09:CB:AC'

export const appleAppSiteAssociation = { webcredentials: { apps: [IOS_APP_ID] } }

export const assetLinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
    target: {
      namespace: 'android_app',
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: [ANDROID_SHA256_CERT_FINGERPRINT],
    },
  },
]

export function appAssociationsRouter(): express.Router {
  const router = express.Router()
  router.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(appleAppSiteAssociation)
  })
  router.get('/.well-known/assetlinks.json', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(assetLinks)
  })
  return router
}
