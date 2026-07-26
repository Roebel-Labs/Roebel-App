import express from 'express'
import type Provider from 'oidc-provider'
import type { AuthBridge } from '../auth-bridge/types.js'
import { renderLoginPage } from './login-page.js'

export function createInteractionRouter(deps: {
  provider: Provider; bridge: AuthBridge; thirdwebClientId: string; chainId: number
}): express.Router {
  const router = express.Router()
  const { provider, bridge } = deps

  router.get('/interaction/:uid', async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res)
      if (details.prompt.name !== 'login' && details.prompt.name !== 'consent') return next()
      res.set('cache-control', 'no-store').send(renderLoginPage(details.uid, deps.thirdwebClientId, deps.chainId))
    } catch (e) { next(e) }
  })

  router.get('/interaction/:uid/nonce', (_req, res) => { res.type('text/plain').send(bridge.issueNonce()) })

  router.post('/interaction/:uid/login', express.json(), async (req, res, next) => {
    try {
      const { address } = await bridge.verifyLogin({ message: req.body.message, signature: req.body.signature })
      const details = await provider.interactionDetails(req, res)

      // Röbel ID is a first-party IdP for its own clients (Nextcloud etc.) — there is no
      // separate end-user consent screen. Grant the requested scopes as part of the same
      // login submission so the provider's consent prompt is satisfied without a second round
      // trip. Only reuse the grant the interaction already carries when it belongs to the wallet
      // that just authenticated; otherwise (no grant, OR a lingering grant for a different
      // account — e.g. re-authenticating with a different wallet on a consent re-prompt) mint a
      // fresh grant for this account. Reusing a mismatched grant would make panva's load_grant
      // throw 'accountId mismatch' and break the legitimate switch-wallet path.
      const clientId = details.params.client_id as string
      const existing = details.grantId ? await provider.Grant.find(details.grantId) : undefined
      const grant = existing && existing.accountId === address
        ? existing
        : new provider.Grant({ accountId: address, clientId })
      grant.addOIDCScope(String(details.params.scope ?? ''))
      const grantId = await grant.save()

      const loginResult = { login: { accountId: address }, consent: { grantId } }
      const redirectTo = await provider.interactionResult(req, res, loginResult, { mergeWithLastSubmission: false })
      res.json({ redirectTo })
    } catch (e: any) {
      // Do not echo the raw exception to the client — an IdP must not leak internal/upstream
      // detail. Log it server-side and return a generic failure.
      console.error('[interaction] login failed', e)
      res.status(401).json({ error: 'login_failed' })
    }
  })

  return router
}
