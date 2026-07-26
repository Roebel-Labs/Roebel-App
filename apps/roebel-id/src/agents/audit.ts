import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditWriter } from './types.js'

// Supabase-backed audit trail for agent token issuance: one `id_agent_audit` row per agent
// `client_credentials` grant. Auditing is best-effort observability, not part of the token-issuance
// critical path — by the time this runs the token has already been minted and handed back to the
// caller (see the provider.ts `client_credentials.issued` listener), so a failed insert is logged
// and swallowed rather than thrown/rejected. Never block or fail token issuance on the audit write.
export function createAuditWriter(client: SupabaseClient): AuditWriter {
  return async ({ agent, actSub, scopes, jti }) => {
    const { error } = await client.from('id_agent_audit').insert({ agent, act_sub: actSub, scopes, jti })
    if (error) console.error('agent audit: insert failed', error)
  }
}
