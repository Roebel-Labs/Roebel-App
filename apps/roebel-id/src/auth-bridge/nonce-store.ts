import { generateNonce } from 'siwe'

export interface NonceStore { issue(): string; consume(nonce: string): boolean }

// Hard cap on outstanding (issued-but-not-yet-consumed) nonces. Without this, the
// unauthenticated GET /interaction/:uid/nonce endpoint mints one entry per hit and — since
// consume() is the only place that ever deletes — an attacker (or just idle browser tabs)
// can grow the Map without bound and OOM the single-instance IdP process.
const MAX_ISSUED = 10_000

export function createMemoryNonceStore(ttlMs = 5 * 60 * 1000): NonceStore {
  const issued = new Map<string, number>()
  return {
    issue() {
      const now = Date.now()
      // Sweep expired entries first so long-lived idle stores don't accumulate garbage
      // between consumes (consume() is the only other place entries are removed).
      for (const [nonce, expiry] of issued) {
        if (expiry < now) issued.delete(nonce)
      }
      // Hard size cap: if still at/over the limit after sweeping, evict the oldest entries.
      // Map iteration order is insertion order, so the front of the Map is the oldest.
      if (issued.size >= MAX_ISSUED) {
        const overBy = issued.size - MAX_ISSUED + 1
        const it = issued.keys()
        for (let i = 0; i < overBy; i++) {
          const oldest = it.next()
          if (oldest.done) break
          issued.delete(oldest.value)
        }
      }
      const nonce = generateNonce()
      issued.set(nonce, now + ttlMs)
      return nonce
    },
    consume(nonce: string) {
      const expiry = issued.get(nonce)
      if (expiry === undefined) return false      // unknown or already used → reject (replay guard)
      issued.delete(nonce)                         // single use
      return Date.now() <= expiry
    },
  }
}
