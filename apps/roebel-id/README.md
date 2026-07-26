# Röbel ID — OIDC Provider

A panva `node-oidc-provider` instance bridging wallet identity (thirdweb smart accounts on Gnosis) to OpenID Connect, enabling Nextcloud SSO via SIWE (Sign in with Ethereum) verification.

## Development

### Local dev server
```bash
pnpm --filter @roebel/roebel-id dev
```
Runs on http://localhost:3010 (or `PORT` env var).

### Generate JWKS secret

Generate a new JWK Set (RS256 keypair) for signing ID tokens:
```bash
pnpm --filter @roebel/roebel-id exec tsx scripts/generate-jwks.ts
```
Copy the JSON output into the `JWKS_JSON` secret on Fly (see Deployment below).

## Deployment (Fly.io)

### 1. Set secrets
```bash
fly secrets set \
  COOKIE_KEYS=your-secret-key-1,your-secret-key-2 \
  SUPABASE_SERVICE_KEY='...' \
  NEXTCLOUD_CLIENT_SECRET='...' \
  JWKS_JSON='{"keys":[{...}]}' \
  -a roebel-id
```

### 2. Deploy
```bash
fly deploy -c apps/roebel-id/fly.toml
```

### 3. List active secrets
```bash
fly secrets list -a roebel-id
```

## Deploy (verify the container build first)

The container build was NOT run/verified in-session. On first `fly deploy`, verify that the image builds successfully. If pnpm errors because workspace packages are missing, the fallback is to use `turbo prune --docker @roebel/roebel-id` to produce a pruned build context, or copy all workspace `package.json` files before the install step.

## Why `min_machines_running = 1`?

Sessions and signing keys are stored in-memory. Scaling to 0 machines (auto-stop) would lose them, breaking login sessions in progress. The `min_machines_running = 1` setting keeps one machine always running on Fly.

## Architecture

- **SIWE Verification**: Validates Ethereum signatures against thirdweb smart accounts (Gnosis chain).
- **AuthBridge**: Maps wallet address → Supabase user record (identity minting, claims resolver).
- **panva oidc-provider**: Implements OpenID Connect core & implicit flows, issuing ID tokens signed with RS256.
- **Nextcloud Redirect**: OAuth2 flow completes at `https://cloud.roebel.app/apps/user_oidc/code`.
