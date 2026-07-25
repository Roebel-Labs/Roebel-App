export interface RoebelClaims {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
  picture?: string
  groups: string[]
  'roebel:citizen': boolean
  'roebel:attester': boolean
  'roebel:tier'?: string
  'roebel:actor_type'?: 'human' | 'agent'
}
export type ProfileReader = (address: string) => Promise<{ email?: string; name?: string; picture?: string; tier?: string } | null>
export type OrgReader = (address: string) => Promise<Array<{ accountId: string; role: string }>>
export type ChainStatusReader = (address: string) => Promise<{ citizen: boolean; attester: boolean }>
