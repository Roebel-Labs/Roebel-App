# Röbel XMTP Push Notification Server — deploy runbook

Self-hosted `xmtp/example-notification-server-go` on Fly. It watches the XMTP
network and forwards APNs/FCM pushes, so inbound DMs — including from external
wallets (Base App, Converse, any XMTP client) — reach the Röbel app **even when
it's backgrounded or killed**. This is the piece that makes offline push
possible; XMTP is E2E so the app itself can't push when it's not running.

Full design: [`docs/superpowers/plans/2026-07-12-xmtp-push-notification-server.md`](../../docs/superpowers/plans/2026-07-12-xmtp-push-notification-server.md).

## What's here

- `fly.toml` — two-process Fly config (api + worker), region `fra`.
- `.env.example` — the secrets you must supply (Apple APNs + Firebase FCM + Postgres).

The server's Go source is **upstream** — you fork it and drop `fly.toml` in.

## Prerequisites (yours to obtain)

1. **Apple APNs `.p8`**: Apple Developer → Certificates, IDs & Profiles → Keys →
   new key with "Apple Push Notifications service (APNs)". Note the **Key ID**,
   your **Team ID**, and the app **bundle id** (`APNS_TOPIC`).
2. **Firebase service account**: Firebase console → the same project as
   `apps/expo/keys/google-services.json` → Project settings → Service accounts →
   Generate new private key. Note the **project id**.
3. **Fly CLI** authenticated (`fly auth login`).

## Deploy

```bash
# 1. Fork + clone the server, then copy this fly.toml in
git clone https://github.com/xmtp/example-notification-server-go
cd example-notification-server-go
cp /path/to/roebel/scripts/xmtp-push-server/fly.toml .

# 2. Create the app + Postgres
fly apps create roebel-xmtp-push
fly postgres create --name roebel-xmtp-push-db --region fra
fly postgres attach roebel-xmtp-push-db -a roebel-xmtp-push   # sets DATABASE_URL

# 3. Set secrets (see .env.example for each value)
fly secrets set -a roebel-xmtp-push \
  DB_CONNECTION_STRING="$DATABASE_URL" \
  APNS_KEY_ID=XXXXXXXXXX APNS_TEAM_ID=YYYYYYYYYY APNS_TOPIC=com.roebel.app \
  APNS_P8="$(cat AuthKey_XXXXXXXXXX.p8)" \
  FCM_PROJECT_ID=roebel-xxxxx \
  FCM_CREDENTIALS_JSON="$(cat serviceAccount.json)"

# 4. Deploy
fly deploy -a roebel-xmtp-push

# 5. Watch the worker connect to XMTP + the api come up
fly logs -a roebel-xmtp-push
```

## Verify

```bash
# The api accepts a registration (proves api + DB + transport):
curl -sS --header "Content-Type: application/json" \
  --data '{"installationId":"smoketest-1","deliveryMechanism":{"apnsDeviceToken":"deadbeef"}}' \
  https://roebel-xmtp-push.fly.dev/notifications.v1.Notifications/RegisterInstallation
# → HTTP 200 with {} . A row appears in the installations table; delete it after.
```

`fly logs` for the `worker` process should show it subscribed to
`grpc.production.xmtp.network:443` with no TLS/auth errors.

## Wire the app to it

Set the app env var to the deployed URL and rebuild:

```
EXPO_PUBLIC_XMTP_PUSH_SERVER=https://roebel-xmtp-push.fly.dev
```

The client (`apps/expo/lib/xmtp/pushRegistration.ts`) no-ops until this is set,
so nothing pushes until the server is live and the app is rebuilt with the var.

## Gotchas

- **env alignment**: the app runs `EXPO_PUBLIC_XMTP_ENV=production`, so the
  worker must use `grpc.production.xmtp.network:443` and `--apns-mode=production`.
  A dev/prod mismatch (network OR APNs mode) = silently zero delivery.
- **APNs mode vs build channel**: `production` APNs matches TestFlight/App Store
  builds. A development build needs `--apns-mode=development` (a separate deploy
  or a dev app).
- **Android must be data-only**: confirm the server sends FCM as a data-only
  message (no `notification` block) so the app can decrypt before display —
  see `cmd/server/main.go` in the fork. A `notification` block auto-displays
  the raw (encrypted) payload.
- **v4/d14n cutover** (date TBD): flip the `worker` process to
  `--listener-type v4 -x grpc.mainnet.xmtp.network:443`. The server translates
  v4→v3, so no client change is needed. Track in `docs/XMTP_INTEGRATION_STATE.md`.
