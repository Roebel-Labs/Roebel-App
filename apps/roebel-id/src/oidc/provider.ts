import Provider, { errors, type Adapter, type AdapterPayload, type Configuration } from 'oidc-provider'
import type { Config } from '../config.js'
import type { RoebelClaims } from '../claims/types.js'
import type { AgentReader, AuditWriter } from '../agents/types.js'
import { agentClientFind } from '../agents/client-source.js'
import { loadJwks } from './jwks.js'

export function buildProvider(deps: {
  config: Config
  adapterFactory: (name: string) => Adapter
  resolveClaims: (address: string) => Promise<RoebelClaims>
  agentReader?: AgentReader
  auditWriter?: AuditWriter
}): Provider {
  const { config, adapterFactory, resolveClaims, agentReader, auditWriter } = deps
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
              getResourceServerInfo: async (ctx, _resourceIndicator, client) => {
                // Defence-in-depth gate. `defaultResource` only gates the DEFAULT resource on the
                // client_credentials grant; an EXPLICIT `resource=${issuer}/agent` param would
                // otherwise reach here for ANY client. Because `roebel:agent` is a global scope and
                // Nextcloud declares no per-client scope allow-list, an unguarded resolver would let
                // Nextcloud (or any non-agent client) mint a JWT with `aud=${issuer}/agent` +
                // `scope=roebel:agent` through the authorization_code flow — a privilege escalation.
                // So the agent resource + JWT format is vended ONLY when the caller is an ENABLED
                // agent on the client_credentials grant; every other caller is rejected with
                // invalid_target and gets no agent-audience token.
                const grantType = (ctx.oidc.params as { grant_type?: string }).grant_type
                const agent = await agentReader(client.clientId)
                if (grantType !== 'client_credentials' || !agent || !agent.enabled) {
                  throw new errors.InvalidTarget('resource is not available to this client')
                }
                // The resource server exposes exactly the agent's granted scopes; the grant
                // intersects the requested scope against this set, so an agent can only mint a token
                // for scopes it actually holds in the registry. Re-reading the agent here keeps the
                // registry the single source of truth for scopes.
                return {
                  scope: ['roebel:agent', ...agent.scopes].join(' '),
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
    // Delegation claims (RFC 8693) on the agent's JWT access token. In panva v8 the ResourceServer
    // `jwt` config only carries signing/encryption keys — it has NO `extraTokenClaims` hook (the
    // brief's `jwt.{ sign, extraTokenClaims }` sketch does not exist in 8.8.1). The mechanism that
    // lands arbitrary claims on an access token is the TOP-LEVEL `extraTokenClaims(ctx, token)`:
    // `opaque.getValueAndPayload` writes its return into `payload.extra` for tokens whose kind is in
    // `{ AccessToken, ClientCredentials }`, and the JWT formatter spreads `...extra` into the signed
    // payload (`lib/models/formats/jwt.js`). The gate is `token.kind === 'ClientCredentials'` — NOT
    // the brief's `token.gty`: the client_credentials grant never sets `gty` (only refresh_token /
    // access_token apply the has_grant_type mixin), so a `gty` check would drop every agent token.
    // For every other token kind (Nextcloud's authorization_code access tokens) this returns
    // undefined, leaving that flow untouched. `sub` is intentionally not emitted here: the JWT
    // formatter forces `sub = accountId || clientId`, and a client_credentials token has no account,
    // so `sub` is already the lowercased agent client_id (the agent address).
    ...(agentReader
      ? {
          extraTokenClaims: async (_ctx, token): Promise<Record<string, unknown> | undefined> => {
            if (token.kind !== 'ClientCredentials' || !token.clientId) return undefined
            const agent = await agentReader(token.clientId.toLowerCase())
            if (!agent || !agent.enabled) return undefined
            return {
              'roebel:actor_type': 'agent',
              act: { sub: agent.ownerSub.toLowerCase() },
              'roebel:scopes': agent.scopes,
            }
          },
        }
      : {}),
    async findAccount(_ctx, id) {
      const claims = await resolveClaims(id)
      return { accountId: id, claims: async () => ({ ...claims, sub: id }) }
    },
  }

  const provider = new Provider(config.issuer, configuration)
  provider.proxy = true // behind Fly's TLS terminator

  // Audit trail: one id_agent_audit row per agent client_credentials token issuance.
  //
  // Event name, verified against the installed oidc-provider@8.8.1 source (not the panva docs
  // prose, which are ambiguous here): every token model's `save()` (lib/models/base_model.js)
  // calls `getValueAndPayload()` and then emits `${snakeCase(this.kind)}.saved` if that call
  // returned a `payload` (the token was persisted through the adapter — true for opaque tokens),
  // or `${snakeCase(this.kind)}.issued` if it did not (true for JWT-formatted tokens, which are
  // self-contained and never written to the adapter — lib/models/formats/jwt.js's
  // `getValueAndPayload` returns only `{ value: signed }`, no `payload` key). The agent access
  // token is forced to JWT format above via `getResourceServerInfo`'s `accessTokenFormat: 'jwt'`,
  // so for THIS token the branch that actually fires is `.issued`, not `.saved` (the brief's
  // guessed `access_token.saved` fires for neither: it's also the wrong kind — see next
  // paragraph — and JWT tokens never hit the `.saved` branch at all).
  //
  // Kind: the client_credentials grant handler (lib/actions/grants/client_credentials.js)
  // constructs `new ClientCredentials({ client, scope })` — a model class literally named
  // `ClientCredentials` (lib/models/client_credentials.js) — not `AccessToken`. `emit()` snake_cases
  // the model's `kind`, so the event is `client_credentials.issued`. Subscribing to this exact,
  // fully-qualified event name IS the "agent client_credentials token" gate: no other grant type or
  // token kind in this provider ever fires it, and (per the `extraTokenClaims` comment above) the
  // client_credentials grant never sets `gty` — so, unlike the brief's sketch, no `token.gty` check
  // is needed (or correct) here.
  if (agentReader && auditWriter) {
    provider.on('client_credentials.issued', async (token: { clientId?: string; jti?: string }) => {
      if (!token.clientId) return
      const agent = await agentReader(token.clientId.toLowerCase())
      if (!agent) return
      await auditWriter({ agent: agent.address, actSub: agent.ownerSub, scopes: agent.scopes, jti: token.jti })
    })
  }

  return provider
}
