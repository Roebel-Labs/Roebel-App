/**
 * @netizen-labs/miniapp-sdk/host — the HOST half of the bridge.
 *
 * Platform-agnostic router: parses incoming client messages, enforces the app's granted
 * permissions, dispatches to platform handlers, normalizes errors, and posts replies. Both
 * the Expo `MiniAppHost` (RN WebView) and the web Playground / AI-builder preview (iframe)
 * construct one of these and only provide (a) a `post(message)` transport and (b) the handlers.
 */
import {
  NETIZEN_PROTOCOL,
  type BridgeError,
  type BridgeErrorCode,
  type BridgeMessage,
  type BridgeMethod,
  type Eip1193RequestArgs,
  type GrantRewardParams,
  type GrantRewardResult,
  type MiniAppContext,
  type MiniAppPermission,
  type MuenzenBalance,
  type NetizenEvent,
  type PayParams,
  type WalletAccount,
} from '../types';

export type { MiniAppContext } from '../types';

/**
 * Platform capability handlers. Every handler is optional; a missing handler for a called
 * method replies `unsupported`. Throw a `BridgeError` (or any Error) to reject the call.
 */
export interface HostHandlers {
  hello?(params: { sdkVersion?: string }): Promise<unknown> | unknown;
  ready?(params: { disableNativeGestures?: boolean }): Promise<void> | void;
  close?(): Promise<void> | void;
  openUrl?(p: { url: string }): Promise<void> | void;
  share?(p: { text?: string; url?: string }): Promise<void> | void;
  addMiniApp?(): Promise<{ added: boolean }> | { added: boolean };
  getContext?(): Promise<MiniAppContext> | MiniAppContext;

  walletGetAccount?(): Promise<WalletAccount | null> | WalletAccount | null;
  walletRequest?(p: Eip1193RequestArgs): Promise<unknown> | unknown;

  authGetToken?(): Promise<{ token: string } | null> | { token: string } | null;
  authSignIn?(): Promise<{ token: string }> | { token: string };

  hapticsImpact?(p: { style?: string }): Promise<void> | void;
  hapticsNotification?(p: { type?: string }): Promise<void> | void;
  hapticsSelection?(): Promise<void> | void;

  getMuenzenBalance?(): Promise<MuenzenBalance> | MuenzenBalance;
  grantReward?(p: GrantRewardParams): Promise<GrantRewardResult> | GrantRewardResult;
  pay?(p: PayParams): Promise<{ txHash: string }> | { txHash: string };

  notificationsSend?(p: {
    title: string;
    body: string;
    targetUrl?: string;
  }): Promise<{ sent: boolean }> | { sent: boolean };

  /** Fire-and-forget; no reply. */
  track?(p: { event: string; props?: Record<string, unknown> }): void;
}

/** Which permission a method requires. Methods not listed are always allowed. */
const METHOD_PERMISSION: Partial<Record<BridgeMethod, MiniAppPermission>> = {
  'wallet.getAccount': 'wallet',
  'wallet.request': 'wallet',
  'roebel.getMuenzenBalance': 'circles',
  'roebel.grantReward': 'rewards',
  'roebel.pay': 'wallet',
  'notifications.send': 'notifications',
  'actions.share': 'share',
};

export interface HostBridgeOptions {
  handlers: HostHandlers;
  /** Deliver a message to the client (iframe.contentWindow.postMessage / RN injectJavaScript). */
  post: (message: BridgeMessage) => void;
  /** Permissions the app was granted (from its approved manifest). Omit = allow all (dev/preview). */
  grantedPermissions?: MiniAppPermission[];
  /** Optional hook for observability (each handled method + outcome). */
  onCall?: (method: BridgeMethod, ok: boolean) => void;
}

export interface HostBridge {
  /** Feed every incoming client message here (from onMessage / WebView onMessage). */
  handleMessage(raw: unknown): void;
  /** Push an unsolicited event to the client (e.g. wallet changed, back pressed). */
  sendEvent(event: NetizenEvent, data?: unknown): void;
}

export function createHostBridge(opts: HostBridgeOptions): HostBridge {
  const { handlers, post, grantedPermissions, onCall } = opts;
  const allowAll = grantedPermissions == null;
  const granted = new Set(grantedPermissions ?? []);

  function has(method: BridgeMethod): boolean {
    const need = METHOD_PERMISSION[method];
    return !need || allowAll || granted.has(need);
  }

  async function dispatch(method: BridgeMethod, params: unknown): Promise<unknown> {
    switch (method) {
      case 'bridge.hello':
        return handlers.hello?.((params ?? {}) as { sdkVersion?: string }) ?? { ok: true };
      case 'actions.ready':
        return handlers.ready?.((params ?? {}) as { disableNativeGestures?: boolean });
      case 'actions.close':
        return handlers.close?.();
      case 'actions.openUrl':
        return handlers.openUrl?.(params as { url: string });
      case 'actions.share':
        return handlers.share?.(params as { text?: string; url?: string });
      case 'actions.addMiniApp':
        return handlers.addMiniApp?.() ?? { added: false };
      case 'context.get':
        return requireHandler(handlers.getContext)();
      case 'wallet.getAccount':
        return handlers.walletGetAccount?.() ?? null;
      case 'wallet.request':
        return requireHandler(handlers.walletRequest)(params as Eip1193RequestArgs);
      case 'auth.getToken':
        return handlers.authGetToken?.() ?? null;
      case 'auth.signIn':
        return requireHandler(handlers.authSignIn)();
      case 'haptics.impact':
        return handlers.hapticsImpact?.(params as { style?: string });
      case 'haptics.notification':
        return handlers.hapticsNotification?.(params as { type?: string });
      case 'haptics.selection':
        return handlers.hapticsSelection?.();
      case 'roebel.getMuenzenBalance':
        return requireHandler(handlers.getMuenzenBalance)();
      case 'roebel.grantReward':
        return requireHandler(handlers.grantReward)(params as GrantRewardParams);
      case 'roebel.pay':
        return requireHandler(handlers.pay)(params as PayParams);
      case 'notifications.send':
        return requireHandler(handlers.notificationsSend)(
          params as { title: string; body: string; targetUrl?: string },
        );
      case 'analytics.track':
        handlers.track?.(params as { event: string; props?: Record<string, unknown> });
        return undefined;
      default:
        throw err('unsupported', `unknown method "${method}"`);
    }
  }

  function reply(id: string, result?: unknown, error?: BridgeError): void {
    post({ netizen: NETIZEN_PROTOCOL, id, ...(error ? { error } : { result }) });
  }

  return {
    handleMessage(raw: unknown): void {
      const msg = parse(raw);
      if (!msg || msg.netizen !== NETIZEN_PROTOCOL || !('method' in msg)) return;
      const { id, method, params } = msg;

      // analytics.track is fire-and-forget: no id, no reply.
      if (method === 'analytics.track') {
        void dispatch(method, params).catch(() => undefined);
        onCall?.(method, true);
        return;
      }

      if (!has(method)) {
        reply(id, undefined, err('unauthorized', `permission required for "${method}"`));
        onCall?.(method, false);
        return;
      }

      Promise.resolve()
        .then(() => dispatch(method, params))
        .then(
          (result) => {
            reply(id, result);
            onCall?.(method, true);
          },
          (e: unknown) => {
            reply(id, undefined, toBridgeError(e));
            onCall?.(method, false);
          },
        );
    },

    sendEvent(event: NetizenEvent, data?: unknown): void {
      post({ netizen: NETIZEN_PROTOCOL, event, data });
    },
  };
}

// --- helpers ---------------------------------------------------------------

function requireHandler<T extends (...args: never[]) => unknown>(fn: T | undefined): T {
  if (!fn) throw err('unsupported', 'handler not implemented by this host');
  return fn;
}

function err(code: BridgeErrorCode, message: string): BridgeError {
  return { code, message };
}

function toBridgeError(e: unknown): BridgeError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    return e as BridgeError;
  }
  return { code: 'internal', message: e instanceof Error ? e.message : String(e) };
}

function parse(data: unknown): BridgeMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as BridgeMessage;
    } catch {
      return null;
    }
  }
  if (data && typeof data === 'object') return data as BridgeMessage;
  return null;
}
