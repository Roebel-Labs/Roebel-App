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
- **CDN** (single-file HTML apps): `import { sdk } from 'https://www.roebel.app/sdk/miniapp-sdk.mjs'`
  (pinned: `/sdk/miniapp-sdk-0.2.0.mjs`). Self-hosted build of this package — always current.

### Mock mode (v0.2) — develop anywhere

If no Netizen host answers the handshake within 1.5s (plain browser tab, `vite dev`,
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

### Releasing

After changing `src/`, run `pnpm --filter @netizen-labs/miniapp-sdk sync-web` (rebuilds
`dist/` and refreshes the checked-in web bundle `apps/web/public/sdk/miniapp-sdk*.mjs`),
then bump the version and `npm publish` (dist-swapped via `publishConfig`).

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
