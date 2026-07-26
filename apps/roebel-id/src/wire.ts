import type express from 'express'
import { createClient } from '@supabase/supabase-js'
import { loadConfig, type Config } from './config.js'
import { createGnosisVerifier } from './lib/gnosis.js'
import { createMemoryNonceStore } from './auth-bridge/nonce-store.js'
import { createThirdwebAuthBridge } from './auth-bridge/thirdweb-bridge.js'
import { createReaders } from './claims/readers.js'
import { createClaimsResolver } from './claims/resolver.js'
import { createAgentReader } from './agents/reader.js'
import { createAuditWriter } from './agents/audit.js'
import { makeSupabaseAdapterFactory } from './store/supabase-adapter.js'
import { buildProvider } from './oidc/provider.js'
import { createInteractionRouter } from './interaction/router.js'
import { createApp } from './app.js'

// Composition root: wires config → verifier → auth bridge → claims readers/resolver →
// Supabase-backed oidc-provider adapter → provider → express app (interaction router +
// provider callback + /healthz). Kept as a single function so index.ts (real server) and
// tests (in-memory adapter + stub bridge) can both assemble the same shape without duplicating
// the wiring.
export function wireApp(config: Config = loadConfig()) {
  const verifier = createGnosisVerifier(config)
  const bridge = createThirdwebAuthBridge({ config, nonceStore: createMemoryNonceStore(), verifier })
  const readers = createReaders(config)
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)
  const agentReader = createAgentReader(supabase)
  const auditWriter = createAuditWriter(supabase)
  const resolveClaims = createClaimsResolver({ ...readers, agent: agentReader })
  const adapterFactory = makeSupabaseAdapterFactory({ client: supabase })
  const provider = buildProvider({ config, adapterFactory, resolveClaims, agentReader, auditWriter })

  const interactionRouter = createInteractionRouter({
    provider, bridge, thirdwebClientId: config.thirdwebClientId, chainId: config.chainId,
  })
  const app = createApp({ provider, interactionRouter })

  // Final error handler, mounted after the interaction router and provider.callback() (both
  // wired inside createApp above). Express recognizes a 4-arg middleware as an error handler
  // regardless of mount order relative to non-error middleware, but it only catches errors
  // from handlers registered before it — so this must stay last. Never leak the raw
  // err.stack/message to the client (stack traces reveal internals to callers of a public
  // IdP); log server-side and respond with a generic message. This only fires for errors
  // passed to next(e) — e.g. the GET /interaction/:uid path in the interaction router — it
  // does not intercept the provider's own (non-error) responses.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[wire] unhandled request error', err)
    if (res.headersSent) return
    res.status(500).json({ error: 'internal_error' })
  })

  return { app, provider, bridge }
}
