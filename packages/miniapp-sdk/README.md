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
await sdk.roebel.grantReward({ amount: 5, reason: 'quiz', idempotencyKey: crypto.randomUUID() });
sdk.track('quiz_completed', { score: 10 });
```

Next.js apps must add `transpilePackages: ['@netizen-labs/miniapp-sdk']`.

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
