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
  /** Optional numeric EIP-1193 / JSON-RPC code the host wants the provider to surface
   * (e.g. 4902 for an unsupported chain, or the RPC node's own error code). */
  rpcCode?: number;
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
  | 'data.userSet'
  // v0.4 — identity and credentials (manifest version "2"). Older hosts answer
  // `unsupported`; check `sdk.supports(method)` first.
  | 'credentials.list'
  | 'credentials.has'
  | 'credentials.request';
// reserved: 'credentials.prove' (credreg-6-zk)

export type NetizenEvent =
  | 'walletChanged'
  | 'back'
  | 'visibilityChanged'
  | 'themeChanged'
  /** v0.4 — the person's shared credentials changed (grant or withdrawal). Data = `Credential[]`. */
  | 'credentialsChanged';

/** Documented event payloads. */
export interface NetizenEventPayloads {
  walletChanged: { address?: string; chainId?: number };
  /** The person pressed back (only sent when the app called `ready({ handlesBack: true })`). */
  back: undefined;
  visibilityChanged: { visible: boolean };
  themeChanged: { theme: 'light' | 'dark' };
  credentialsChanged: Credential[];
}

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
    /** The host's current colour scheme, when it reports one. */
    theme?: 'light' | 'dark';
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
  /** Manifest version; absent = "1". */
  version?: '1' | '2';
  /** Version "2" only: what the app may ask the person to share. */
  identity?: MiniAppIdentityRequest;
  /** Version "2" only: contracts the app calls; reviewed, then sponsored (gasless). */
  contracts?: DeclaredContract[];
}

/** One contract a version-2 manifest declares, with the functions the app calls on it. */
export interface DeclaredContract {
  address: string;
  /** Shown on the confirm sheet instead of the address. */
  label: string;
  /** Canonical function signatures, e.g. `checkIn(uint256)`. */
  functions: string[];
}

/** One credential a version-2 manifest asks for, with the reason shown to the person. */
export interface CredentialRequest {
  /** Credential reference: `citizen` | `attester` | `guest` | `type:0x…` | `org:<org account id>`. */
  type: string;
  reason: string;
}

/** The `identity` section of a version-2 manifest: what the app may ask the person to share. */
export interface MiniAppIdentityRequest {
  profile: boolean;
  address: boolean;
  credentials: CredentialRequest[];
}

/** A credential the person holds and agreed to share with this app. */
export interface Credential {
  /** A built-in (`citizen`, `attester`, `guest`) or a `type:0x…` reference. */
  type: string;
  kind: 'builtin' | 'role' | 'membership' | 'badge';
  /** The issuing org's account id, when the credential has one. */
  org?: string;
  name: string;
  imageUrl?: string;
  /** Unix seconds; null or absent = no expiry. */
  validUntil?: number | null;
  /** Whether this community recognises the issuer. */
  recognised: boolean;
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
  /** Credentials the mock person holds. Default: one built-in `citizen`. */
  credentials?: Credential[];
  /** Token returned by `auth.getToken` in mock mode. Default: none (null). */
  token?: string;
}

// ---------------------------------------------------------------------------
// Public SDK surface
// ---------------------------------------------------------------------------

export interface ReadyOptions {
  disableNativeGestures?: boolean;
  /** true → the host sends a `back` event instead of closing the app on back. */
  handlesBack?: boolean;
}

export interface NetizenSDK {
  /** Resolves once the bridge handshake with the host completes. */
  isReady: Promise<void>;

  actions: {
    /** MANDATORY: dismiss the host splash once your UI is mounted. */
    ready(opts?: ReadyOptions): Promise<void>;
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
    /** `nonce` (optional) is bound into the token so your server can check freshness. */
    signIn(opts?: { nonce?: string }): Promise<{ token: string }>;
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

  // --- v0.4 additive: identity and credentials (manifest version "2") ------

  /** Credentials the person agreed to share with this app. A private credential
   * is answered as "holds it" only. Every call can reject on older hosts
   * (`unsupported`) — check `supports('credentials.list')` first. */
  // reserved: 'credentials.prove' (credreg-6-zk)
  credentials: {
    list(): Promise<Credential[]>;
    /** `type` is a credential reference; `org:<id>` matches any credential of that org. */
    has(type: string): Promise<boolean>;
    /** Ask for more; only types in the app's reviewed manifest can be granted. */
    request(types: string[]): Promise<{ granted: string[] }>;
    /** Called with the new list after a grant or a withdrawal. Returns an unsubscribe function. */
    onChange(cb: (list: Credential[]) => void): () => void;
  };

  /** Whether the host implements `method`. true in mock mode and on older hosts
   * that do not announce their methods (let the call decide). */
  supports(method: BridgeMethod): boolean;

  // --- v0.2 additive introspection (no behavior change inside a real host) ---

  /** Transport heuristic: 'webview' | 'iframe' | 'standalone'. An 'iframe' may
   * still be a foreign embedder — use `isMockMode()` after `isReady` for truth. */
  hostEnvironment(): 'webview' | 'iframe' | 'standalone';

  /** true once the bridge fell back to the local mock (no Netizen host
   * answered). Settled by the time `isReady` resolves. */
  isMockMode(): boolean;
}
