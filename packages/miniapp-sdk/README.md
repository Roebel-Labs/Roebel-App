# @netizen-labs/miniapp-sdk

The Netizen Mini App SDK — one bridge, two halves.

- **Client** (`@netizen-labs/miniapp-sdk`): bundled by every mini app. Talks to whatever host embeds it
  (Röbel Expo WebView, web Playground iframe) over a `postMessage` protocol.
- **Host** (`@netizen-labs/miniapp-sdk/host`): used by hosts to answer client calls — shared routing,
  permission-gating, and error normalization; the platform only supplies a `post()` transport and
  capability handlers.

See [`../../docs/superpowers/specs/2026-07-03-netizen-mini-apps-design.md`](../../docs/superpowers/specs/2026-07-03-netizen-mini-apps-design.md)
for the full contract and [`DESIGN.md`](./DESIGN.md) for the mini-app design system.

## Client usage (in a mini app)

```ts
import { sdk } from '@netizen-labs/miniapp-sdk';

// dismiss the host splash once mounted — MANDATORY
useEffect(() => { void sdk.actions.ready(); }, []);

const ctx = await sdk.getContext();               // untrusted, display only
const provider = await sdk.wallet.getEthereumProvider(); // EIP-1193, host-signed
const { balance } = await sdk.roebel.getMuenzenBalance();
// Rewards are capped server-side at 1 Münze per user per app per day — always request 1.
await sdk.roebel.grantReward({ amount: 1, reason: 'quiz', idempotencyKey: crypto.randomUUID() });
sdk.track('quiz_completed', { score: 10 });
```

Next.js apps must add `transpilePackages: ['@netizen-labs/miniapp-sdk']`.

### Getting the SDK

- **npm** (any bundler — Next.js, Vite, Lovable, …): `npm i @netizen-labs/miniapp-sdk`
- **CDN** (single-file HTML apps), a self-hosted build of this package:
  - pinned: `https://www.roebel.app/sdk/miniapp-sdk-<version>.mjs` — current `miniapp-sdk-0.4.0.mjs`.
    Never changes; use it for anything that is live.
  - unpinned: `https://www.roebel.app/sdk/miniapp-sdk.mjs` — always the newest release, so a
    new SDK version reaches your app without a redeploy (including changed behaviour, see
    [`CHANGELOG.md`](./CHANGELOG.md)). Fine for prototypes.

### Mock mode — develop anywhere

The SDK re-sends its hello every 400 ms. If no Netizen host answers within 2 s (plain browser tab, `vite dev`,
an external AI editor's preview iframe), the SDK switches to a **local mock**: `ready()`
resolves, `getContext()` returns a demo user, `getMuenzenBalance()` returns a demo
balance, `grantReward()` resolves `{ granted: false }`, `track()` no-ops, and signing
methods reject `unsupported`. Inside the Röbel app nothing changes.

```ts
await sdk.isReady;
sdk.isMockMode();      // true outside the Röbel host
sdk.hostEnvironment(); // 'webview' | 'iframe' | 'standalone' (transport only)

// Optional page-level overrides (set BEFORE the SDK loads):
window.__NETIZEN_MOCK__ = {
  context: { user: { id: '0x1', displayName: 'Testerin', isCitizen: true } },
  account: { address: '0x…', chainId: 100 },
  balance: { balance: '42', decimals: 18, symbol: 'RÖ' },
  rewards: true, // demo happy-path for grantReward
};
```

### Availability in the Röbel app

`auth.getToken()`, `auth.signIn()`, `roebel.pay()`, `sdk.credentials.*`, the read and
`wallet_sendCalls` methods of the provider and the events `back`, `visibilityChanged`,
`themeChanged`, `credentialsChanged` work in the Röbel app from version 3.10.0. An older
app answers `unsupported`; ask `sdk.supports('<method>')` first and degrade gracefully.

Events (`sdk.on(event, cb)` returns an unsubscribe function):

| Event | Payload |
| --- | --- |
| `walletChanged` | `{ address?, chainId? }` |
| `back` | none — only sent after `sdk.actions.ready({ handlesBack: true })` |
| `visibilityChanged` | `{ visible: boolean }` |
| `themeChanged` | `{ theme: 'light' \| 'dark' }` |
| `credentialsChanged` | `Credential[]` (after a grant or a withdrawal) |

### Releasing

Bump the version in `package.json`, `src/client.ts` (`SDK_VERSION`) and
`apps/web/src/lib/miniapp/ai/htmlPrompt.ts` (`SDK_VERSION`), add a `CHANGELOG.md` entry, then
run `pnpm --filter @netizen-labs/miniapp-sdk release`: one build feeds npm (dist-swapped via
`publishConfig`) and the checked-in CDN copies (`apps/web/public/sdk/miniapp-sdk*.mjs`).
`release:check` runs the same agreement check without publishing.

## Guides

The full developer guide is https://www.roebel.app/mini-apps/llms-full.txt (index:
`/mini-apps/llms.txt`; the MCP tool `get_docs` serves each chapter). Chapters for 0.4.0:
`identity` (manifest version 2, consent, pseudonym), `verify` (`verifyUserToken`,
`verifySignIn` from `@netizen-labs/miniapp-verify`), `credentials` (`sdk.credentials.*`,
`holdsCredential`), `wallet` (provider methods, limits, error codes, `roebel.pay`, events),
`gasless` (declared contracts, gas budget), `issuer` (badges through an org delegate key; needs
the credential register) and `store` (`audience`, `org`).

## Host usage (Expo / web)

```ts
import { createHostBridge } from '@netizen-labs/miniapp-sdk/host';

const bridge = createHostBridge({
  post: (msg) => webViewRef.injectJavaScript(deliver(msg)), // or iframe.contentWindow.postMessage
  grantedPermissions: app.permissions,
  handlers: {
    ready: () => hideSplash(),
    getContext: async () => buildContext(user),
    walletRequest: (args) => walletProviderWithConfirmSheet(args),
    grantReward: (p) => serverAuthorizedGrant(app.id, p),
    // ...
  },
});
// feed incoming messages:  webView.onMessage = (e) => bridge.handleMessage(e.nativeEvent.data);
```
