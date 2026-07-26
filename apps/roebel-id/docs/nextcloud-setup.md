# Nextcloud user_oidc Setup

This guide configures Nextcloud to authenticate users via Röbel ID (OIDC provider).

## Prerequisites

- Röbel ID dev server running with a public tunnel (e.g., ngrok)
- Nextcloud container running via `docker-compose.nextcloud.yml`
- `user_oidc` app requires Nextcloud 25+

## Setup Steps

### 1. Install the user_oidc app

```bash
docker compose -f docker-compose.nextcloud.yml exec -u www-data nextcloud php occ app:install user_oidc
```

### 2. Configure the Roebel OIDC Provider

Replace `<NEXTCLOUD_CLIENT_SECRET>` with the actual client secret from your Röbel ID configuration, and `https://your-tunnel-url.com` with the actual tunnel URL (e.g., ngrok URL).

```bash
docker compose -f docker-compose.nextcloud.yml exec -u www-data nextcloud php occ user_oidc:provider Roebel \
  --clientid="nextcloud" \
  --clientsecret="<NEXTCLOUD_CLIENT_SECRET>" \
  --discoveryuri="https://your-tunnel-url.com/.well-known/openid-configuration" \
  --scope="openid email profile roebel" \
  --unique-uid=1 \
  --mapping-uid=sub \
  --mapping-email=email \
  --mapping-display-name=name \
  --mapping-groups=groups
```

### 3. Enable Group Provisioning

Enable automatic group provisioning from OIDC token claims:

```bash
docker compose -f docker-compose.nextcloud.yml exec -u www-data nextcloud php occ config:app:set user_oidc provisioning_groups --value=1
```

## Configuration Notes

- **Unique UID**: Uses the `sub` (subject) claim from the token, which is the user's lowercased blockchain address
- **Mapping**: Maps OIDC claims to Nextcloud user properties
  - `sub` → Nextcloud username (unique identifier)
  - `email` → User email address
  - `name` → Display name
  - `groups` → Nextcloud groups
- **Scopes**: Requests `openid`, `email`, `profile`, and custom `roebel` scope
- **Group Provisioning**: Automatically creates and manages Nextcloud groups based on token claims (e.g., `citizen`, `attester`, `org:<id>:<role>`)

## SSL/TLS Configuration

For production, ensure:
1. Röbel ID ISSUER_URL uses HTTPS
2. Nextcloud NEXTCLOUD_REDIRECT_URIS includes the tunnel or production URL
3. Set `force_https` in Röbel ID config if needed

## Troubleshooting

- Check Nextcloud logs: `docker compose -f docker-compose.nextcloud.yml logs nextcloud`
- Verify OIDC discovery endpoint is reachable from Nextcloud container
- Confirm client ID and secret match Röbel ID configuration
- Ensure redirect URI is registered in Röbel ID client settings
