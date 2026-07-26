import { describe, it, expect } from 'vitest'
import { createAgentReader } from '../src/agents/reader.js'

function fakeClient(row: any) {
  return { from() { const s: any = { f: {} }; const api: any = {
    select() { return api }, eq(k: string, v: any) { s.f[k] = v; return api },
    maybeSingle() { return Promise.resolve({ data: row && Object.entries(s.f).every(([k, v]) => row[k] === v) ? row : null, error: null }) },
  }; return api } }
}

describe('createAgentReader', () => {
  it('maps an id_agents row to an Agent (enabled)', async () => {
    const reader = createAgentReader(fakeClient({
      address: '0xaaa', owner_sub: '0xowner', display_name: 'Mecky', scopes: ['roebel:agent'],
      budget_ref: 'zodiac:1', client_secret: 's3cr3t', enabled: true,
    }) as any)
    const agent = await reader('0xAAA')
    expect(agent).toEqual({ address: '0xaaa', ownerSub: '0xowner', displayName: 'Mecky',
      scopes: ['roebel:agent'], budgetRef: 'zodiac:1', clientSecret: 's3cr3t', enabled: true })
  })
  it('returns null for an unknown address', async () => {
    const reader = createAgentReader(fakeClient(null) as any)
    expect(await reader('0xnope')).toBeNull()
  })
})
