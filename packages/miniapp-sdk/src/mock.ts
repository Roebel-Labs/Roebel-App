/**
 * Mock host — answers bridge requests locally when no Netizen host replies.
 *
 * This makes a mini app fully demo-able outside the Röbel app: a plain browser
 * tab, `next dev` / `vite dev`, or an external AI editor's preview iframe
 * (Lovable, v0, …). Behavior is inert-but-friendly: no real wallet, no real
 * rewards, but `ready()`, context, balance and tracking all "work".
 *
 * Override defaults from the page before the SDK loads:
 *
 *   window.__NETIZEN_MOCK__ = {
 *     context: { user: { id: '0x1', displayName: 'Testerin', isCitizen: true } },
 *     account: { address: '0x00000000000000000000000000000000000000ff', chainId: 100 },
 *     balance: { balance: '42', decimals: 18, symbol: 'RÖ' },
 *     rewards: true, // grantReward resolves granted:true (demo happy path)
 *   }
 */
import type {
  BridgeError,
  BridgeMethod,
  GrantRewardParams,
  MiniAppContext,
  MuenzenBalance,
  NetizenMockConfig,
  WalletAccount,
} from './types';

declare global {
  interface Window {
    __NETIZEN_MOCK__?: NetizenMockConfig;
  }
}

export function getMockConfig(): NetizenMockConfig {
  if (typeof window === 'undefined') return {};
  return window.__NETIZEN_MOCK__ ?? {};
}

function mockContext(): MiniAppContext {
  const cfg = getMockConfig();
  const query: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    new URLSearchParams(window.location.search).forEach((v, k) => {
      query[k] = v;
    });
  }
  const base: MiniAppContext = {
    user: {
      id: '0x0000000000000000000000000000000000000000',
      displayName: 'Demo Bürger:in',
      isCitizen: true,
    },
    host: { name: 'netizen-mock', platform: 'web', version: '0.0.0' },
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    launch: { entry: 'mock', query },
  };
  return { ...base, ...cfg.context, user: cfg.context?.user !== undefined ? cfg.context.user : base.user };
}

function mockAccount(): WalletAccount | null {
  const cfg = getMockConfig();
  return cfg.account !== undefined ? cfg.account : null;
}

function mockBalance(): MuenzenBalance {
  return getMockConfig().balance ?? { balance: '12', decimals: 18, symbol: 'RÖ' };
}

function err(code: BridgeError['code'], message: string): BridgeError {
  return { code, message };
}

let announced = false;
export function announceMockMode(): void {
  if (announced || typeof console === 'undefined') return;
  announced = true;
  // eslint-disable-next-line no-console
  console.info(
    '[netizen] Kein Röbel-Host erkannt — Mock-Modus aktiv. Wallet/Rewards sind deaktiviert. ' +
      'Konfiguration: window.__NETIZEN_MOCK__ · Docs: https://www.roebel.app/developers/mini-apps',
  );
}

/** Answer a bridge request locally. Mirrors the host router's method set. */
export function mockDispatch(method: BridgeMethod, params: unknown): Promise<unknown> {
  switch (method) {
    case 'bridge.hello':
      return Promise.resolve({ ok: true, host: 'netizen-mock' });
    case 'actions.ready':
    case 'actions.close':
    case 'haptics.impact':
    case 'haptics.notification':
    case 'haptics.selection':
      return Promise.resolve(undefined);
    case 'actions.openUrl': {
      const url = (params as { url?: string } | undefined)?.url;
      if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
      return Promise.resolve(undefined);
    }
    case 'actions.share': {
      const p = (params ?? {}) as { text?: string; url?: string };
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        return navigator.share({ text: p.text, url: p.url }).catch(() => undefined);
      }
      return Promise.resolve(undefined);
    }
    case 'actions.addMiniApp':
      return Promise.resolve({ added: false });
    case 'context.get':
      return Promise.resolve(mockContext());
    case 'wallet.getAccount':
      return Promise.resolve(mockAccount());
    case 'wallet.request': {
      const args = (params ?? {}) as { method?: string };
      const account = mockAccount();
      switch (args.method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return Promise.resolve(account ? [account.address] : []);
        case 'eth_chainId':
          return Promise.resolve(`0x${(account?.chainId ?? 100).toString(16)}`);
        case 'net_version':
          return Promise.resolve(String(account?.chainId ?? 100));
        default:
          return Promise.reject(
            err('unsupported', `Mock-Modus: "${args.method ?? 'unknown'}" braucht den Röbel-Host`),
          );
      }
    }
    case 'auth.getToken':
      return Promise.resolve(null);
    case 'auth.signIn':
      return Promise.reject(err('unsupported', 'Mock-Modus: Anmeldung braucht den Röbel-Host'));
    case 'roebel.getMuenzenBalance':
      return Promise.resolve(mockBalance());
    case 'roebel.grantReward': {
      const p = params as GrantRewardParams;
      if (getMockConfig().rewards) {
        return Promise.resolve({ granted: true, amount: Math.min(p?.amount ?? 1, 1), txRef: 'mock' });
      }
      return Promise.resolve({ granted: false, amount: 0 });
    }
    case 'roebel.pay':
      return Promise.reject(err('unsupported', 'Mock-Modus: Zahlungen brauchen den Röbel-Host'));
    case 'notifications.send':
      return Promise.resolve({ sent: false });
    case 'analytics.track':
      return Promise.resolve(undefined);
    default:
      return Promise.reject(err('unsupported', `Mock-Modus: Methode "${method}" nicht verfügbar`));
  }
}
