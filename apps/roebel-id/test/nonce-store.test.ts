import { describe, it, expect } from 'vitest'
import { createMemoryNonceStore } from '../src/auth-bridge/nonce-store.js'

describe('createMemoryNonceStore', () => {
  it('sweeps an expired nonce on a later issue() so it can no longer be consumed', async () => {
    const store = createMemoryNonceStore(1) // 1ms ttl
    const expired = store.issue()
    await new Promise((r) => setTimeout(r, 5)) // let it expire
    store.issue() // triggers the sweep
    expect(store.consume(expired)).toBe(false)
  })

  it('never lets the store grow past the hard size cap', () => {
    const store = createMemoryNonceStore(5 * 60 * 1000) // long ttl, so this only exercises the cap, not expiry
    const first = store.issue()
    const MAX = 10_000
    // Issue enough additional nonces to push well past the cap.
    for (let i = 0; i < MAX + 100; i++) store.issue()
    // The very first nonce issued must have been evicted (oldest-first) once the cap was hit,
    // so it can no longer be consumed.
    expect(store.consume(first)).toBe(false)
  })
})
