import type { RoebelClaims, ProfileReader, OrgReader, ChainStatusReader } from './types.js'
import type { AgentReader } from '../agents/types.js'

export function createClaimsResolver(deps: {
  profile: ProfileReader; orgs: OrgReader; chain: ChainStatusReader; agent: AgentReader
}): (address: string) => Promise<RoebelClaims> {
  return async (rawAddress: string): Promise<RoebelClaims> => {
    const sub = rawAddress.toLowerCase()

    const agent = await deps.agent(sub)
    if (agent && agent.enabled) {
      return {
        sub, name: agent.displayName, preferred_username: agent.displayName,
        groups: ['agent', `owned-by:${agent.ownerSub}`],
        'roebel:citizen': false, 'roebel:attester': false, 'roebel:actor_type': 'agent',
      }
    }

    const [profile, orgs, status] = await Promise.all([deps.profile(sub), deps.orgs(sub), deps.chain(sub)])

    const groups: string[] = []
    if (status.citizen) groups.push('citizen')
    if (status.attester) groups.push('attester')
    for (const o of orgs) groups.push(`org:${o.accountId}:${o.role}`)

    return {
      sub,
      email: profile?.email,
      email_verified: profile?.email ? true : undefined,
      name: profile?.name,
      preferred_username: profile?.name,
      picture: profile?.picture,
      groups,
      'roebel:citizen': status.citizen,
      'roebel:attester': status.attester,
      'roebel:tier': profile?.tier,
      'roebel:actor_type': 'human',
    }
  }
}
