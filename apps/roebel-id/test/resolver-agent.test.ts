import { describe, it, expect } from 'vitest'
import { createClaimsResolver } from '../src/claims/resolver.js'

const humanDeps = {
  profile: async () => ({ name: 'Anke', email: 'a@b.de' }),
  orgs: async () => [], chain: async () => ({ citizen: true, attester: false }),
}
describe('createClaimsResolver — agent awareness', () => {
  it('marks a registered agent as actor_type=agent', async () => {
    const resolve = createClaimsResolver({ ...humanDeps,
      agent: async (a) => a === '0xagent' ? { address: '0xagent', ownerSub: '0xowner', scopes: ['roebel:agent'], clientSecret: 'x', enabled: true } : null })
    const c = await resolve('0xAGENT')
    expect(c['roebel:actor_type']).toBe('agent')
    expect(c.groups).toContain('agent')
    expect(c.sub).toBe('0xagent')
  })
  it('leaves a human as actor_type=human', async () => {
    const resolve = createClaimsResolver({ ...humanDeps, agent: async () => null })
    const c = await resolve('0xHUMAN')
    expect(c['roebel:actor_type']).toBe('human')
    expect(c.groups).not.toContain('agent')
  })
})
