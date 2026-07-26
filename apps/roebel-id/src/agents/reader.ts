import type { SupabaseClient } from '@supabase/supabase-js'
import type { Agent, AgentReader } from './types.js'

export function createAgentReader(client: SupabaseClient): AgentReader {
  return async (rawAddress: string): Promise<Agent | null> => {
    const address = rawAddress.toLowerCase()
    const { data, error } = await client.from('id_agents')
      .select('address, owner_sub, display_name, scopes, budget_ref, client_secret, enabled')
      .eq('address', address).maybeSingle()
    if (error) { console.error('agent reader: query failed', error); throw error }
    if (!data) return null
    return {
      address: data.address, ownerSub: data.owner_sub, displayName: data.display_name ?? undefined,
      scopes: data.scopes ?? [], budgetRef: data.budget_ref ?? undefined,
      clientSecret: data.client_secret, enabled: data.enabled,
    }
  }
}
