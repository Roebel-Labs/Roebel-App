import Provider, { type Adapter, type AdapterPayload, type Configuration } from 'oidc-provider'
import type { Config } from '../config.js'
import type { RoebelClaims } from '../claims/types.js'
import type { AgentReader } from '../agents/types.js'
import { agentClientFind } from '../agents/client-source.js'
import { loadJwks } from './jwks.js'

export function buildProvider(deps: {
  config: Config
  adapterFactory: (name: string) => Adapter
  resolveClaims: (address: string) => Promise<RoebelClaims>
  agentReader?: AgentReader
}): Provider {
  const { config, adapterFactory, resolveClaims, agentReader } = deps
  const jwks = loadJwks()

  // Resource indicator that binds an agent's client_credentials access token to a JWT-format
  // resource server. panva v8 has no `formats.AccessToken` hook: it issues an OPAQUE token unless
  // the token is bound to a ResourceServer whose `accessTokenFormat` is 'jwt' (via the
  // resourceIndicators feature). This single synthetic resource is what flips agent tokens to JWT.
  const AGENT_RESOURCE = `${config.issuer}/agent`

  // Wrap the `Client` adapter so an unknown client_id (not in the static `clients` array below and
  // not stored) falls through to the agent registry. Nextcloud stays static; agents are resolved
  // dynamically at auth time — an enabled agent yields its client metadata, a disabled/unknown one
  // yields undefined (kill switch). Only the `Client` model is wrapped; every other payload type is
  // handed the untouched inner adapter.
  const wrappedAdapterFactory: (name: string) => Adapter = agentReader
    ? (name: string): Adapter => {
        const inner = adapterFactory(name)
        if (name !== 'Client') return inner
        const findAgent = agentClientFind(agentReader)
        return {
          ...inner,
          async find(id: string): Promise<AdapterPayload | undefined> {
            const stored = await inner.find(id)
            if (stored) return stored
            const agentClient = await findAgent(id)
            return agentClient ? (agentClient as unknown as AdapterPayload) : undefined
          },
        }
      }
    : adapterFactory

  const configuration: Configuration = {
    adapter: wrappedAdapterFactory,
    clients: [{
      client_id: config.nextcloud.clientId,
      client_secret: config.nextcloud.clientSecret,
      redirect_uris: config.nextcloud.redirectUris,
      post_logout_redirect_uris: config.nextcloud.postLogoutRedirectUris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
    }],
    ...(jwks.keys.length ? { jwks } : {}),
    cookies: { keys: config.cookieKeys },
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      // Non-interactive agent login: the client_credentials grant lets an agent present its client
      // secret at the token endpoint and receive an access token bound to itself (no user session).
      ...(agentReader
        ? {
            clientCredentials: { enabled: true },
            // Resource indicators are ONLY used to force the agent token into JWT format. For every
            // non-client_credentials request (Nextcloud's authorization_code flow) defaultResource
            // returns undefined — byte-for-byte identical to the feature-disabled path in panva's
            // check_resource, so the existing flow is completely unaffected.
            resourceIndicators: {
              enabled: true,
              defaultResource: async (ctx): Promise<string | string[]> =>
                (ctx.oidc.params as { grant_type?: string }).grant_type === 'client_credentials'
                  ? AGENT_RESOURCE
                  : (undefined as unknown as string),
              getResourceServerInfo: async (_ctx, _resourceIndicator, client) => {
                // The resource server exposes exactly the agent's granted scopes; the grant
                // intersects the requested scope against this set, so an agent can only mint a token
                // for scopes it actually holds in the registry. `roebel:agent` (the global AS scope)
                // is always included. Re-reading the agent here keeps the registry the single source
                // of truth for scopes (the client metadata only carries the global allow-list).
                const agent = await agentReader(client.clientId)
                return {
                  scope: ['roebel:agent', ...(agent?.scopes ?? [])].join(' '),
                  accessTokenFormat: 'jwt' as const,
                }
              },
            },
          }
        : {}),
    },
    // Röbel ID is a first-party IdP for its own clients (Nextcloud etc.) — there is no
    // third-party RP that only gets a bare `sub`. Spec-conformant oidc-provider only puts
    // scope-derived claims (email/profile/roebel) on the ID token when response_type is
    // `id_token`; otherwise they're only available via the userinfo endpoint. Disable that so
    // groups/roebel:* claims travel directly in the authorization_code flow's ID token.
    conformIdTokenClaims: false,
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    ttl: { AuthorizationCode: 60, IdToken: 3600, AccessToken: 3600, ClientCredentials: 3600, Session: 1209600 },
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name', 'preferred_username', 'picture'],
      roebel: ['groups', 'roebel:citizen', 'roebel:attester', 'roebel:tier', 'roebel:actor_type'],
    },
    scopes: ['openid', 'email', 'profile', 'roebel', ...(agentReader ? ['roebel:agent'] : [])],
    async findAccount(_ctx, id) {
      const claims = await resolveClaims(id)
      return { accountId: id, claims: async () => ({ ...claims, sub: id }) }
    },
  }

  const provider = new Provider(config.issuer, configuration)
  provider.proxy = true // behind Fly's TLS terminator
  return provider
}
