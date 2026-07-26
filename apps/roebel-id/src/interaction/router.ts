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
      // login submission (reusing an existing grant for this account+client when the
      // interaction already carries one, e.g. a re-login within an active session) so the
      // provider's consent prompt is satisfied without a second round trip.
      const clientId = details.params.client_id as string
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({ accountId: address, clientId })
      if (!grant) throw new Error('grant not found')
      grant.addOIDCScope(String(details.params.scope ?? ''))
      const grantId = await grant.save()

      const loginResult = { login: { accountId: address }, consent: { grantId } }
      const redirectTo = await provider.interactionResult(req, res, loginResult, { mergeWithLastSubmission: false })
      res.json({ redirectTo })
    } catch (e: any) { res.status(401).json({ error: e.message }) }
  })

  return router
}
