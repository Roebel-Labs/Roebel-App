import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAuditWriter } from '../src/agents/audit.js'

function fakeClient(insertResult: { error: unknown }) {
  const calls: any[] = []
  return {
    calls,
    from(table: string) {
      return {
        insert(row: any) {
          calls.push({ table, row })
          return Promise.resolve(insertResult)
        },
      }
    },
  }
}

describe('createAuditWriter', () => {
  afterEach(() => vi.restoreAllMocks())

  it('inserts a snake_case id_agent_audit row from an AuditEntry', async () => {
    const client = fakeClient({ error: null })
    const write = createAuditWriter(client as any)
    await write({ agent: '0xagent', actSub: '0xowner', scopes: ['workspace:draft'], jti: 'abc' })
    expect(client.calls).toEqual([
      { table: 'id_agent_audit', row: { agent: '0xagent', act_sub: '0xowner', scopes: ['workspace:draft'], jti: 'abc' } },
    ])
  })

  it('never throws when the insert fails — logs and resolves instead', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = fakeClient({ error: { message: 'boom' } })
    const write = createAuditWriter(client as any)
    await expect(write({ agent: '0xagent', actSub: '0xowner', scopes: [] })).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
  })
})
