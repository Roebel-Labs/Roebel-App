import type { ClientMetadata } from 'oidc-provider'
import type { Agent, AgentReader } from './types.js'

// Map a registry Agent → an OIDC client that authenticates non-interactively via the
// client_credentials grant. No redirect_uris / response_types: agents never run a browser
// authorization_code flow, they present their client secret directly at the token endpoint.
//
// The client's `scope` allow-list is ONLY the global AS scope `roebel:agent`: panva v8 rejects
// client metadata whose `scope` contains values the Authorization Server does not statically
// support, and per-agent scopes (e.g. `workspace:draft`) are dynamic. Those granted scopes are
// modelled as RESOURCE-SERVER scopes instead (surfaced by the provider's getResourceServerInfo
// from this same registry), which is the idiomatic v8 way to carry non-global scopes into a token.
export function buildAgentClient(agent: Agent): ClientMetadata {
  return {
    client_id: agent.address.toLowerCase(),
    client_secret: agent.clientSecret,
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    token_endpoint_auth_method: 'client_secret_basic',
    scope: 'roebel:agent',
  }
}

// Adapter 'Client' resolver: an ENABLED agent resolves to its OIDC client metadata; a disabled
// or unknown agent resolves to `undefined` so panva treats the client_id as non-existent
// (invalid_client → 401). That `undefined` IS the kill switch — flipping `enabled` to false in
// the registry immediately stops the agent from minting tokens.
export function agentClientFind(agentReader: AgentReader) {
  return async (id: string): Promise<ClientMetadata | undefined> => {
    const agent = await agentReader(id.toLowerCase())
    if (!agent || !agent.enabled) return undefined
    return buildAgentClient(agent)
  }
}
