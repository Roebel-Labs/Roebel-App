/**
 * Netizen Mini App SDK — FROZEN shared types.
 *
 * These types are the contract between mini apps (client) and hosts (Expo WebView / web iframe).
 * Both the client SDK and every host implementation import from here. Do not break these shapes
 * without bumping the protocol version and updating every host.
 */

/** Protocol version tag present on EVERY bridge message. Used to filter foreign postMessages. */
export const NETIZEN_PROTOCOL = 1 as const;

// ---------------------------------------------------------------------------
// Bridge envelope
// ---------------------------------------------------------------------------

/** mini app → host */
export interface BridgeRequest {
  netizen: typeof NETIZEN_PROTOCOL;
  id: string;
  method: BridgeMethod;
  params?: unknown;
}

/** host → mini app (reply to a request) */
export interface BridgeResponse {
  netizen: typeof NETIZEN_PROTOCOL;
  id: string;
  result?: unknown;
  error?: BridgeError;
}

/** host → mini app (unsolicited) */
export interface BridgeEventMessage {
  netizen: typeof NETIZEN_PROTOCOL;
  event: NetizenEvent;
  data?: unknown;
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEventMessage;

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}

export type BridgeErrorCode =
  | 'user_rejected'
  | 'unauthorized'
  | 'unsupported'
  | 'invalid_params'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'timeout'
  | 'internal';

/** Every callable bridge method. Host routers switch on these. */
export type BridgeMethod =
  | 'bridge.hello'
  | 'actions.ready'
  | 'actions.close'
  | 'actions.openUrl'
  | 'actions.share'
  | 'actions.addMiniApp'
  | 'context.get'
  | 'wallet.getAccount'
  | 'wallet.request'
  | 'auth.getToken'
  | 'auth.signIn'
  | 'haptics.impact'
  | 'haptics.notification'
  | 'haptics.selection'
  | 'roebel.getMuenzenBalance'
  | 'roebel.grantReward'
  | 'roebel.pay'
  | 'notifications.send'
  | 'analytics.track'
  // v0.3 — mini-app datastore ("Mini-CMS"). Older hosts answer `unsupported`;
  // apps must ship built-in fallback content.
  | 'data.get'
  | 'data.list'
  | 'data.userGet'
  | 'data.userSet';

export type NetizenEvent =
  | 'walletChanged'
  | 'back'
  | 'visibilityChanged'
  | 'themeChanged';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface MiniAppContext {
  /** UNTRUSTED — passed by the host, display only. Never use for authentication. */
  user: {
    id: string;
    displayName?: string;
    avatarUrl?: string;
    isCitizen: boolean;
  } | null;
  host: {
    name: string;
    platform: 'ios' | 'android' | 'web';
    version: string;
  };
  safeAreaInsets: { top: number; bottom: number; left: number; right: number };
  launch: {
    referrer?: string;
    entry?: string;
    query?: Record<string, string>;
  };
}

export interface WalletAccount {
  address: string;
  chainId: number;
}

export interface Eip1193RequestArgs {
  method: string;
  params?: unknown[] | object;
}

export interface Eip1193Provider {
  request(args: Eip1193RequestArgs): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface MuenzenBalance {
  /** decimal string, human units (already divided by decimals) */
  balance: string;
  decimals: number;
  symbol: 'RÖ';
}

export interface GrantRewardParams {
  amount: number;
  reason: string;
  /** Client-generated; the host enforces uniqueness per (app, key). */
  idempotencyKey: string;
}

export interface GrantRewardResult {
  granted: boolean;
  /** Münzen actually granted — may be LESS than requested (the host caps
   * rewards at 1 Münze per user per app per day and clamps to the remainder). */
  amount?: number;
  txRef?: string;
  remainingBudget?: number;
}

export interface PayParams {
  to: string;
  amount: number;
  memo?: string;
}

// ---------------------------------------------------------------------------
// Manifest / registry
// ---------------------------------------------------------------------------

export type MiniAppCategory =
  | 'community'
  | 'governance'
  | 'finance'
  | 'utility'
  | 'games'
  | 'education'
  | 'news'
  | 'culture'
  | 'environment';

export type MiniAppPermission = 'wallet' | 'rewards' | 'notifications' | 'circles' | 'share';

export interface MiniAppManifest {
  slug: string;
  name: string;
  iconUrl: string;
  homeUrl: string;
  description: string;
  category: MiniAppCategory;
  tags: string[];
  screenshots?: string[];
  permissions: MiniAppPermission[];
  primaryColor?: string;
}

export type MiniAppStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'live'
  | 'rejected'
  | 'suspended';

// ---------------------------------------------------------------------------
// Mock mode (v0.2) — development outside the Röbel host
// ---------------------------------------------------------------------------

/**
 * Page-level overrides for mock mode, read from `window.__NETIZEN_MOCK__`.
 * Only consulted when no Netizen host answers the handshake.
 */
export interface NetizenMockConfig {
  context?: Partial<MiniAppContext>;
  account?: WalletAccount | null;
  balance?: MuenzenBalance;
  /** true → grantReward resolves granted:true (demo happy path). Default false. */
  rewards?: boolean;
  /** Mock app CONTENT for sdk.data.get/list (key → value). User-scope
   * setUser/getUser use an in-memory map on top. */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public SDK surface
// ---------------------------------------------------------------------------

export interface NetizenSDK {
  /** Resolves once the bridge handshake with the host completes. */
  isReady: Promise<void>;

  actions: {
    /** MANDATORY: dismiss the host splash once your UI is mounted. */
    ready(opts?: { disableNativeGestures?: boolean }): Promise<void>;
    close(): Promise<void>;
    openUrl(url: string): Promise<void>;
    share(payload: { text?: string; url?: string }): Promise<void>;
    addMiniApp(): Promise<{ added: boolean }>;
  };

  getContext(): Promise<MiniAppContext>;

  wallet: {
    getEthereumProvider(): Promise<Eip1193Provider>;
    getAccount(): Promise<WalletAccount | null>;
  };

  auth: {
    getToken(): Promise<{ token: string } | null>;
    signIn(): Promise<{ token: string }>;
  };

  haptics: {
    impact(style?: 'light' | 'medium' | 'heavy'): Promise<void>;
    notification(type?: 'success' | 'warning' | 'error'): Promise<void>;
    selection(): Promise<void>;
  };

  roebel: {
    getMuenzenBalance(): Promise<MuenzenBalance>;
    grantReward(p: GrantRewardParams): Promise<GrantRewardResult>;
    pay(p: PayParams): Promise<{ txHash: string }>;
  };

  notifications: {
    send(p: { title: string; body: string; targetUrl?: string }): Promise<{ sent: boolean }>;
  };

  /** Fire-and-forget. Never throws, never blocks. */
  track(event: string, props?: Record<string, unknown>): void;

  /** Subscribe to a host event. Returns an unsubscribe function. */
  on(event: NetizenEvent, cb: (data: unknown) => void): () => void;

  // --- v0.3 additive: mini-app datastore ("Mini-CMS") -----------------------

  /** Scoped storage through the host — no own backend needed.
   * `get`/`list` read the app's shared CONTENT (edited by the developer in
   * the dashboard "Inhalte" tab or via MCP; read-only at runtime).
   * `getUser`/`setUser` read/write the CURRENT USER's own state (progress,
   * submissions), keyed by their wallet. Apps must ship fallbacks: every call
   * can reject (older host → `unsupported`). */
  data: {
    get(key: string): Promise<{ value: unknown | null; exists: boolean }>;
    list(prefix?: string): Promise<{ items: { key: string; value: unknown }[] }>;
    getUser(key: string): Promise<{ value: unknown | null; exists: boolean }>;
    setUser(key: string, value: unknown): Promise<{ ok: boolean }>;
  };

  // --- v0.2 additive introspection (no behavior change inside a real host) ---

  /** Transport heuristic: 'webview' | 'iframe' | 'standalone'. An 'iframe' may
   * still be a foreign embedder — use `isMockMode()` after `isReady` for truth. */
  hostEnvironment(): 'webview' | 'iframe' | 'standalone';

  /** true once the bridge fell back to the local mock (no Netizen host
   * answered). Settled by the time `isReady` resolves. */
  isMockMode(): boolean;
}
