import express from 'express'
import type Provider from 'oidc-provider'

export function createApp(deps: { provider?: Provider; interactionRouter?: express.Router } = {}): express.Express {
  const app = express()
  if (deps.interactionRouter) app.use(deps.interactionRouter)
  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }) })
  if (deps.provider) app.use(deps.provider.callback())
  return app
}
