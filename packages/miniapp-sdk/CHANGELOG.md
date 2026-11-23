# Changelog — @netizen-labs/miniapp-sdk

## 0.5.0

Bridge protocol stays 1. On an older host `data.rows` answers `unsupported`; check
`sdk.supports('data.rows')`.

### Added

- `sdk.data.collection(name, { scope })` — rows that many people write to (bookings, sign-ups,
  check-ins): `list({ keyPrefix, mine, limit, order })`, `add({ data, privateData, key })`,
  `update(id, patch)`, `remove(id)`. `shared` (default): everyone sees `data`, only the author and
  the app owner see `privateData`. `private`: only the author. A `key` is unique within the
  collection; a second `add` rejects with the new error code `conflict`.
- Mock mode keeps rows in memory with the same rules.
- Host: handler `dataRows`, and `previewRows` for builder previews.

## 0.4.0

Bridge protocol stays 1. On an older host every new method answers `unsupported`;
`sdk.supports()` tells in advance.

### Added

- `sdk.credentials.*` — ask for the credentials the person agrees to share, and listen for changes.
- `sdk.supports(method)` — know before calling whether the host implements a method.
- `auth.signIn({ nonce })` — the nonce is passed to the host and signed; verify it on your server
  (`@netizen-labs/miniapp-verify`).
- `auth.getToken()` now works on hosts that support it.
- EIP-1193 provider: read methods (`eth_call`, `eth_getBalance`, `eth_blockNumber`, …) and
  `wallet_sendCalls` (gasless for calls declared in the manifest).
- `roebel.pay` — pay in Röbel Münzen through the host's own confirmation sheet.
- Events `back`, `visibilityChanged`, `themeChanged`, `credentialsChanged`.
- `actions.ready({ handlesBack })` — the app handles the back gesture itself.
- Manifest version 2 types: `identity`, `contracts`, `audience`, `org`.

### Changed

- Errors thrown by the EIP-1193 provider now carry a numeric `code` (4001, 4100, 4200, 4902, …)
  as EIP-1193 specifies; the bridge's string code moves to `error.data.bridgeCode`. Code that
  compared `error.code` to a string must compare to the number or to `error.data.bridgeCode`.
- A chain switch away from Gnosis is an error (4902).

### Release

`pnpm --filter @netizen-labs/miniapp-sdk release` builds once, copies the build to
`apps/web/public/sdk/` (pinned file and the unpinned alias), checks that `package.json`, the
client's `SDK_VERSION` and the AI builder's pin agree, then publishes. `release:check` runs the
same check without publishing.

## 0.3.1

Previous release.
