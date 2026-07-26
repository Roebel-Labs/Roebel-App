export interface Agent {
  address: string
  ownerSub: string
  displayName?: string
  scopes: string[]
  budgetRef?: string
  clientSecret: string
  enabled: boolean
}
export type AgentReader = (address: string) => Promise<Agent | null>
export interface AuditEntry { agent: string; actSub: string; scopes: string[]; jti?: string }
export type AuditWriter = (entry: AuditEntry) => Promise<void>
