/**
 * The `sdk` object mini apps use. Thin, typed wrappers over the bridge.
 */
import { ClientBridge } from './bridge';
import { createEip1193Provider } from './provider';
import type {
  Eip1193Provider,
  GrantRewardParams,
  GrantRewardResult,
  MiniAppContext,
  MuenzenBalance,
  NetizenEvent,
  NetizenSDK,
  PayParams,
  WalletAccount,
} from './types';

export function createClient(): NetizenSDK {
  const bridge = new ClientBridge();
  let provider: Eip1193Provider | undefined;

  // Handshake: resolves isReady once the host acknowledges. Non-fatal on failure
  // (a mini app may run in a plain browser during development).
  const isReady = bridge
    .request('bridge.hello', { sdkVersion: '0.1.0' })
    .then(() => undefined)
    .catch(() => undefined);

  const sdk: NetizenSDK = {
    isReady,

    actions: {
      ready: (opts) => bridge.request<void>('actions.ready', opts ?? {}),
      close: () => bridge.request<void>('actions.close'),
      openUrl: (url) => bridge.request<void>('actions.openUrl', { url }),
      share: (payload) => bridge.request<void>('actions.share', payload),
      addMiniApp: () => bridge.request<{ added: boolean }>('actions.addMiniApp'),
    },

    getContext: () => bridge.request<MiniAppContext>('context.get'),

    wallet: {
      getEthereumProvider: async () => {
        if (!provider) provider = createEip1193Provider(bridge);
        return provider;
      },
      getAccount: () => bridge.request<WalletAccount | null>('wallet.getAccount'),
    },

    auth: {
      getToken: () => bridge.request<{ token: string } | null>('auth.getToken'),
      signIn: () => bridge.request<{ token: string }>('auth.signIn'),
    },

    haptics: {
      impact: (style) => bridge.request<void>('haptics.impact', { style: style ?? 'medium' }),
      notification: (type) => bridge.request<void>('haptics.notification', { type: type ?? 'success' }),
      selection: () => bridge.request<void>('haptics.selection'),
    },

    roebel: {
      getMuenzenBalance: () => bridge.request<MuenzenBalance>('roebel.getMuenzenBalance'),
      grantReward: (p: GrantRewardParams) => bridge.request<GrantRewardResult>('roebel.grantReward', p),
      pay: (p: PayParams) => bridge.request<{ txHash: string }>('roebel.pay', p),
    },

    notifications: {
      send: (p) => bridge.request<{ sent: boolean }>('notifications.send', p),
    },

    track: (event, props) => bridge.notify('analytics.track', { event, props: props ?? {} }),

    on: (event: NetizenEvent, cb) => bridge.on(event, cb),
  };

  return sdk;
}
