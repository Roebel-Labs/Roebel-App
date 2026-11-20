# Mini apps: identity, credentials and wallet — design

**Date:** 2026-11-17 · **Status:** draft. Max asked for build plans directly; choices he did not state himself are
marked *(my call)*, and the ones only he can settle are in section 8.
**Project 3 of 3.** Depends on [`2026-11-17-credential-register-design.md`](2026-11-17-credential-register-design.md)
(project 2) for credentials, and on [`2026-11-17-sovereign-signup-design.md`](2026-11-17-sovereign-signup-design.md)
(project 1) for the account types a mini app will meet.

## 1. Intent

Mini apps should be able to work with everything the register knows: who is a citizen, a member of which Verein, who
holds which office or badge. A mini app should be able to adapt to that ("Trainingsplan nur für Mitglieder"), the
app should be able to recommend mini apps based on it, and mini apps should be able to use the person's wallet
properly, on every kind of account. Developers and their coding agents should be able to do this from the docs
alone.

## 2. What exists (verified in code 2026-11-17)

- SDK `@netizen-labs/miniapp-sdk` 0.3.1 (npm has 0.3.0), bridge protocol 1. `MiniAppContext.user` is `{id,
  displayName, avatarUrl, isCitizen}`, explicitly untrusted. Nothing about roles, orgs or badges. Permissions:
  `wallet | rewards | notifications | circles | share`; `context.get`, `auth.*` and `data.*` are never gated and
  there is no consent prompt for identity data.
- **A mini app's server cannot verify who the user is.** `auth.getToken` returns `null` in the Expo host,
  `auth.signIn` and `roebel.pay` are rejected as unsupported, although the docs tell developers to use them.
- **Several of our own routes trust any wallet address the caller sends:** `POST /api/mini-apps/rewards`,
  `/api/mini-apps/data` with `scope=user`, runtime `POST /api/mini-apps/notifications`, `GET
  /api/mini-apps/muenzen-balance`. The developer MCP accepts a bare wallet address as bearer token.
- The Expo host does no origin or frame check on incoming bridge messages. The web host does not show a
  confirmation for `eth_signTypedData_v3`. The developer preview grants all permissions to any URL.
- **Wallet:** Gnosis only. `eth_accounts` without prompt; signing and sending behind a confirm sheet. Chain
  switching silently "succeeds". No read calls are proxied (`eth_call`, `eth_getBalance`…), so a mini app needs its
  own RPC. On an independent (Safe) account the sponsor refuses every mini-app transaction, and a migrated account
  returns a signature format no third-party server can check.
- The OIDC keystone (`apps/roebel-id`) already resolves citizen, attester, tier and org roles into claims and has
  signing keys, but only for fixed first-party clients.
- Manifest (`/.well-known/roebel-miniapp.json`, version "1") has no way to say what identity data an app wants or
  whom it is for. The store lists apps by featured and newest only; nothing is filtered or recommended by who the
  user is. Events `back`, `visibilityChanged`, `themeChanged` are documented but never sent.
- Contract ABIs and readers are not published; only addresses are exported.

## 3. Goals, non-goals, anti-goals

**Goals**
- A mini app can ask, with the person's consent, which credentials they hold, and can prove it on its own server.
- The wallet works for mini apps on all three account types (old sign-in, passkey, 12 words), including gasless
  transactions to contracts the mini app declared.
- The app can show the right mini apps to the right people, and an org can have its own mini app for its members.
- Our own mini-app routes stop trusting unproven wallet addresses.
- Docs, mock and published packages that a coding agent can build against without reading our source.

**Non-goals**
- A general OAuth/OIDC provider for arbitrary websites (the keystone stays first-party; mini apps get tokens through
  the host).
- Mini apps on other chains.
- Paying mini-app developers, or a paid store.
- Letting mini apps run code outside their web view.

**Anti-goals**
- A mini app learning anything about a person they did not agree to share: no silent wallet address, no full
  credential list, no private membership leaking through recommendations.
- One fingerprint per read, or per token.
- A mini app able to drain the gas budget or move funds without a clear confirmation.
- Breaking the mini apps that are live today.

## 4. Approaches considered

| Approach | Verdict |
|---|---|
| **A. The host is the identity provider**: scopes in the manifest, consent in the app, short-lived signed tokens for the mini app's server, credentials answered by the host | **Chosen** *(my call)*. The person approves once per app, the mini app's server verifies a standard token with public keys and needs no blockchain knowledge, private credentials can be proven without being revealed to anyone else. |
| B. Mini apps read the chain themselves | Kept as the sovereign second path (published ABIs and a verify package), but not sufficient alone: it cannot see private credentials, forces every developer to handle smart-account signatures, and exposes the wallet address by default. |
| C. Full OIDC login per mini app (redirects to the keystone) | Rejected: a login screen inside an app the person is already signed in to, and dynamic client registration to build and secure. |

## 5. Design

### 5.1 First: close the holes (independent of everything else)

- Every runtime route that acts for a user requires a token issued for that user and that mini app (5.3). The host
  attaches it; a mini-app server calling our routes passes it on. The caller-supplied wallet parameter is ignored.
- The developer MCP no longer accepts a bare wallet address as credentials.
- The Expo host only accepts bridge messages from the mini app's own origin and top frame.
- The web host confirms every signing method.
- The developer preview keeps working but shows which permissions it simulates.
- Live mini apps keep working: the host starts attaching tokens in the same release that the routes start accepting
  them, and the routes require them one release later, behind a switch.

### 5.2 Scopes and consent

- New manifest section `identity` (manifest version "2"; version "1" keeps today's behaviour and gets nothing new):
  - `profile` — display name and picture;
  - `address` — the account address (needed for on-chain apps; without it the app gets a stable pseudonymous id that
    is different for every mini app);
  - `credentials` — a list of the credential types the app wants to know about, each with a one-line German reason
    shown to the person: built-ins `citizen`, `attester`, `guest`, and register types by org and type, or "any type
    of this org".
- The first time an app is opened the host shows one consent sheet: what the app wants to know and why, each item
  switchable, "Erlauben". Changes in a later manifest version ask again only for what is new. Everything can be
  withdrawn in the app's detail page.
- Private credentials: the host can answer "holds it: yes" without telling the mini app or anyone else more. The
  consent sheet marks them ("Diese Mitgliedschaft ist privat. Die App erfährt nur, dass du Mitglied bist.").
- The review of a mini app checks that what it asks for matches what it does.

### 5.3 Proof for the mini app's server

- `sdk.auth.getToken()` works in the Expo host: it returns a short-lived signed token (minutes) for this mini app
  and this user, containing the pseudonymous id (or the address, if granted), and the granted credential answers
  with their expiry. No fingerprint: the host gets it from the node using the session it already has.
- Tokens are signed by the community's identity service (the keystone's keys; public keys at a well-known URL), so a
  mini-app server verifies them with any standard library. One issuer per community.
- `sdk.auth.signIn()` is the sovereign alternative: a sign-in message signed by the account itself. Because our
  accounts are smart accounts (and migrated ones sign in a wrapped format), we publish a small verify package that
  handles all of them.
- Published for developers: `@netizen-labs/miniapp-verify` (verify a token; verify an account signature of any of
  our account types; read public credentials from the chain) including the contract ABIs.

### 5.4 Credentials in the SDK

- `sdk.credentials.list()` — the granted credential types the person holds (type, org, kind, name, image, valid
  until, recognised).
- `sdk.credentials.has(type)` — yes/no for a granted type.
- `sdk.credentials.request(types)` — ask for more at runtime (shows the consent sheet).
- `sdk.credentials.onChange(cb)` — when something is accepted, revoked or expires while the app is open.
- `context.user.isCitizen` stays for old apps. The mock supports all of it, so an app can be developed without the
  host.
- **Mini apps as issuers** need no new bridge method: an org appoints the mini app's own key as a delegate for one
  credential type (project 2), and the mini app's server issues badges with it ("10 Trainings absolviert"). The
  docs explain the recipe.

### 5.5 Wallet

- **Reads through the host:** the provider answers the standard read methods (`eth_call`, `eth_getBalance`,
  `eth_getLogs` with limits, receipts, block number, gas estimates) against the community's RPC, so a mini app
  needs no RPC of its own.
- **Honest chain handling:** asking for another chain returns the standard "unsupported chain" error instead of
  pretending to switch.
- **Batches:** support for sending several calls as one (`wallet_sendCalls` and capability discovery), so a mini
  app flow is one confirmation and one fingerprint.
- **Gasless transactions on every account type:** a mini app declares in its manifest the contracts and functions
  it calls. After review, the sponsor accepts exactly those calls from that mini app, with no value attached,
  charged against a gas budget per mini app and a small daily allowance per person. Anything else is refused before
  a confirmation is shown, with a clear message. Accounts on the old sign-in keep their current behaviour.
- **Confirmation sheet** names the mini app, the contract (by its declared label, never a raw address alone) and
  what is being signed, and warns on anything not declared.
- **`roebel.pay`** is implemented: a Röbel Münzen payment to a named recipient with amount and memo, confirmed by
  the person.
- The host sends the `back`, `visibilityChanged` and `themeChanged` events the docs promise.

### 5.6 Finding the right mini apps

- Manifest section `audience` (optional): who the app is for, as a list of credential types ("für Bürger:innen",
  "für Mitglieder des PSV"), and whether that is a requirement or a recommendation. An app can also be **bound to
  an org**; the org confirms the binding, and the app then appears on the org's page.
- In the store: a "Für dich" rail from the credentials the person holds, a filter "Meine Vereine", and locked apps
  shown with the reason and how to get in ("Für Mitglieder. Mitglied werden →").
- Matching happens on the device, so a private membership never leaves it. Apps the person qualifies for can be
  suggested as Erkunden blocks through the existing layout mechanism (suggest only, the person taps "Übernehmen").
- Accepting a credential can suggest the org's mini app once.

### 5.7 Developer experience

- SDK 0.4.0 with the above, published to npm and the CDN in the same step; bridge protocol stays 1, the host
  advertises which methods it supports so new SDKs degrade cleanly on old hosts.
- Docs corrected where they are wrong today (CDN version, handshake time, events, tool list, manifest file name) and
  extended: identity and consent, verifying a user on your server, credentials, wallet rules, gasless calls, being
  an issuer. The agent-facing docs (`llms.txt`, `publish.md`, the developer MCP `get_docs`) carry the same content.
- SDK tests are added (there are none today).
- The template mini app demonstrates credential-gated content and a verified server call.

### 5.8 Rollout

In this order, each shippable alone: (1) close the holes; (2) tokens, scopes, consent and credentials; (3) wallet;
(4) audience, store and docs. Parts 2 and 4 need the credential register for org types, but work with the built-ins
(`citizen`, `attester`) before it exists. Host changes ship by OTA; nothing needs a new native module.

## 6. Constraints

Project 1's section 6 applies. Additionally: the first-party mini apps (`apps/mini-apps/roebel-data`, the template,
and the externally hosted ones such as the PSV boxing app, which is not in this repo) must keep working through
every step; never return wallet addresses from public read APIs; mini-app routes live in `apps/web`, tests there are
`node:test`.

## 7. Left to the builder

Token format details and lifetimes, the pseudonymous id derivation, table and route names, limits for proxied
reads, the exact manifest JSON shape, copy and screens, test strategy.

## 8. Decisions that are Max's

1. **Mini apps do not get the wallet address unless they ask for it and the person agrees** (5.2). Today every mini
   app gets it silently. This changes live behaviour for version-1 manifests only when they upgrade.
2. **Gasless mini-app transactions are paid from a budget per mini app** that we grant at review (5.5). Alternative:
   no gasless for mini apps, which leaves them unusable on independent accounts.
3. **Requiring tokens on the existing routes will break any external mini app that calls them from its own server
   with a bare wallet** (5.1). I planned one release of overlap; tell me if an external developer needs more notice.
