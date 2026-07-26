# Nextcloud E2E Test Checklist

This is the executable E2E test for proving the Röbel ID OIDC keystone against a real Nextcloud instance. This checklist represents the spec's success criteria (§1).

## Prerequisites

- Röbel ID dev server deployed or running locally
- Public tunnel configured for Röbel ID (e.g., ngrok)
- Nextcloud container environment ready
- client ID `nextcloud` and client secret registered in Röbel ID
- `ISSUER_URL` and `NEXTCLOUD_REDIRECT_URIS` configured with the tunnel URL

## Test Steps

### Step 1: Start the Röbel ID Dev Server with Public Tunnel

- [ ] Run the Röbel ID service with `pnpm dev`
- [ ] Start ngrok or equivalent: `ngrok http 3000`
- [ ] Note the tunnel URL (e.g., `https://abc123.ngrok.io`)
- [ ] Update `ISSUER_URL` in `.env` to the tunnel URL
- [ ] Update `NEXTCLOUD_REDIRECT_URIS` to include `https://<tunnel-url>/callback` and `http://localhost:8080/apps/user_oidc/code`
- [ ] Confirm dev server is running and `.well-known/openid-configuration` is reachable from the tunnel URL

### Step 2: Start Nextcloud and Run Setup Commands

- [ ] Start the Nextcloud stack: `docker compose -f apps/roebel-id/docker-compose.nextcloud.yml up -d`
- [ ] Wait for Nextcloud to be ready: `curl -s http://localhost:8080 | grep -q "Nextcloud"`
- [ ] Run the setup commands from `apps/roebel-id/docs/nextcloud-setup.md`, substituting:
  - `<NEXTCLOUD_CLIENT_SECRET>` with the actual secret from Röbel ID config
  - `https://your-tunnel-url.com` with the ngrok URL
- [ ] Verify app installation: `docker compose -f docker-compose.nextcloud.yml exec -u www-data nextcloud php occ app:list | grep user_oidc`

### Step 3: Verify OIDC Login Button Appears

- [ ] Open http://localhost:8080 in a browser
- [ ] Verify the login page displays a "Login with Roebel" button (or similar, provisioned by user_oidc)
- [ ] Click "Login with Roebel"

### Step 4: Complete Röbel ID Authentication Flow

- [ ] Redirected to Röbel ID login page (tunnel URL)
- [ ] See "Mit Röbel anmelden" (Sign in with Röbel) button or equivalent thirdweb connect UI
- [ ] Click "Mit Röbel anmelden" or select email login option
- [ ] Complete email/thirdweb connection flow (smart account creation if first-time user)
- [ ] Sign SIWE (Sign-In-With-Ethereum) message in wallet
- [ ] Confirm or deny consent screen (user_oidc may prompt for claim grants)

### Step 5: Verify Auto-Provisioned User

- [ ] Redirected back to Nextcloud (http://localhost:8080)
- [ ] Logged in as a new Nextcloud user
- [ ] User's username is the lowercased blockchain address (from `sub` claim)
- [ ] Verify in Nextcloud admin panel: Users → Check for the new user

### Step 6: Verify User Metadata and Groups

- [ ] Check user properties in admin panel (Users → Select user):
  - [ ] Email field populated from OIDC `email` claim
  - [ ] Display name populated from OIDC `name` claim
- [ ] Check user's group memberships (Users → user name → Groups):
  - [ ] Includes `citizen` group (if user holds CitizenNFT on chain)
  - [ ] Includes `attester` group (if user holds AttesterNFT on chain)
  - [ ] Includes `org:<id>:<role>` groups (if user is an org member in account_owners table)
  - [ ] Groups match the `groups` claim in the token

### Step 7: Test Nextcloud Office (Collabora) Integration

- [ ] Navigate to Nextcloud Files tab
- [ ] Create or open a document (e.g., `.odt` file)
- [ ] Verify document opens in Collabora (Nextcloud Office)
- [ ] Test editing: Make text changes
- [ ] Verify changes persist (save automatically or after explicit save)
- [ ] Close and reopen the document to confirm save was successful

## Pass Criteria

**PASS** if all steps 3–7 succeed without errors. This confirms:
- OIDC authentication flow end-to-end
- User auto-provisioning with correct claims mapping
- Group provisioning from token claims
- Nextcloud/Collabora integration working
- Röbel ID serves as a valid OIDC provider for Nextcloud

## Troubleshooting & Recording

### If a step fails:

1. **Consent prompt issues**: Check `apps/roebel-id/src/interaction/router.ts` — may need to handle `consent` prompt explicitly via `Grant`.
2. **Claims/scope mismatch**: Verify token contains `groups` claim; check `apps/roebel-id/src/claims/resolver.ts` that `groups` array is populated.
3. **Group mapping not working**: Re-run `php occ config:app:set user_oidc provisioning_groups --value=1`
4. **Redirect URI mismatch**: Check `NEXTCLOUD_REDIRECT_URIS` in Röbel ID config includes Nextcloud's callback URL.
5. **ngrok connection issues**: Restart ngrok, update `ISSUER_URL` if tunnel URL changes.

### Record results:

- [ ] Document any deviations or failures (attach logs if available)
- [ ] Screenshot the successful login and group provisioning
- [ ] Note any integration gaps found (e.g., missing consent handling, incorrect claim names)

## Live E2E Status

**Current Status**: Not yet run (deferred to user)

This checklist is provided as a specification-proven acceptance test. When the Röbel ID service is deployed and the local Nextcloud environment is available, run this checklist end-to-end to verify the keystone integration.
