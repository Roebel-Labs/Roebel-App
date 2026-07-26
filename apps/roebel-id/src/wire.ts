import { createClient } from '@supabase/supabase-js'
import { loadConfig, type Config } from './config.js'
import { createGnosisVerifier } from './lib/gnosis.js'
import { createMemoryNonceStore } from './auth-bridge/nonce-store.js'
import { createThirdwebAuthBridge } from './auth-bridge/thirdweb-bridge.js'
import { createReaders } from './claims/readers.js'
import { createClaimsResolver } from './claims/resolver.js'
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
  const resolveClaims = createClaimsResolver(readers)
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)
  const adapterFactory = makeSupabaseAdapterFactory({ client: supabase })
  const provider = buildProvider({ config, adapterFactory, resolveClaims })

  const interactionRouter = createInteractionRouter({
    provider, bridge, thirdwebClientId: config.thirdwebClientId, chainId: config.chainId,
  })
  const app = createApp({ provider, interactionRouter })

  return { app, provider, bridge }
}
