import { describe, it, expect } from 'vitest'
import { renderLoginPage } from '../src/interaction/login-page.js'

describe('login page auto-auth', () => {
  const html = renderLoginPage('uid-123', 'tw-client', 100)

  it('keeps the SIWE statement ASCII-only', () => {
    // The signed statement must be ASCII (siwe@3 EIP-4361 ABNF).
    const m = html.match(/statement:\s*'([^']*)'/)
    expect(m).not.toBeNull()
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(m![1])).toBe(true)
    expect(m![1]).toBe('Anmeldung bei Roebel ID')
  })

  it('attempts a silent autoConnect on load (seamless path)', () => {
    expect(html).toContain('autoConnect(')
  })

  it('still renders the manual fallback button', () => {
    expect(html).toContain('id="login"')
  })

  it('shares one sign-in routine for both paths (no duplicated fetch/login block)', () => {
    // exactly one POST to the login endpoint in the emitted script
    const occurrences = (html.match(/\/interaction\/\$\{uid\}\/login|\/interaction\/uid-123\/login/g) || []).length
    expect(occurrences).toBe(1)
  })
})
