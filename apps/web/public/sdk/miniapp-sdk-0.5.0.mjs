// src/rows-mock.ts
var store = /* @__PURE__ */ new Map();
var seq = 0;
var err = (code, message) => ({ code, message });
var bucket = (c) => `${c.scope}:${c.collection}`;
function mockRows(call) {
  if (!call || typeof call.collection !== "string" || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(call.collection)) {
    return Promise.reject(err("invalid_params", "Ung\xFCltiger Sammlungsname (a-z, 0-9, - und _, bis 40 Zeichen)."));
  }
  const rows = store.get(bucket(call)) ?? [];
  store.set(bucket(call), rows);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  switch (call.op) {
    case "list":
      return Promise.resolve(listRows(rows, call.query));
    case "add": {
      if (call.key != null && rows.some((r) => r.key === call.key)) {
        return Promise.reject(err("conflict", "Schon vergeben."));
      }
      seq += 1;
      const row = {
        id: `mock-${seq}`,
        key: call.key ?? null,
        data: call.data ?? {},
        privateData: call.privateData ?? null,
        mine: true,
        createdAt: now,
        updatedAt: now
      };
      rows.push(row);
      return Promise.resolve(row);
    }
    case "update": {
      const row = rows.find((r) => r.id === call.id);
      if (!row) return Promise.reject(err("invalid_params", "Eintrag nicht gefunden."));
      if (call.data) row.data = call.data;
      if (call.privateData) row.privateData = call.privateData;
      row.updatedAt = now;
      return Promise.resolve(row);
    }
    case "remove": {
      const i = rows.findIndex((r) => r.id === call.id);
      if (i >= 0) rows.splice(i, 1);
      return Promise.resolve({ ok: i >= 0 });
    }
    default:
      return Promise.reject(err("invalid_params", "Unbekannte Operation."));
  }
}
function listRows(rows, q = {}) {
  let out = rows.filter((r) => q.keyPrefix ? (r.key ?? "").startsWith(q.keyPrefix) : true);
  const total = out.length;
  const order = q.order ?? "newest";
  out = [...out].sort(
    (a, b) => order === "key" ? (a.key ?? "").localeCompare(b.key ?? "") : order === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)
  );
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 200);
  return { rows: out.slice(0, limit), total };
}

// src/credential-ref.ts
var BUILTIN_CREDENTIALS = ["citizen", "attester", "guest"];
var TYPE_RE = /^type:(0x[0-9a-fA-F]{64})$/;
var ORG_RE = /^org:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
function parseCredentialRef(s) {
  if (typeof s !== "string") return null;
  if (BUILTIN_CREDENTIALS.includes(s)) {
    return { kind: "builtin", name: s };
  }
  const t = TYPE_RE.exec(s);
  if (t) return { kind: "type", typeId: t[1].toLowerCase() };
  const o = ORG_RE.exec(s);
  if (o) return { kind: "org", org: o[1].toLowerCase() };
  return null;
}
function isCredentialRef(s) {
  return typeof s === "string" && parseCredentialRef(s) !== null;
}
function credentialMatches(pattern, held) {
  const p = parseCredentialRef(pattern);
  if (!p) return false;
  if (p.kind === "org") return typeof held.org === "string" && held.org.toLowerCase() === p.org;
  const h = parseCredentialRef(held.type);
  if (!h) return false;
  if (p.kind === "builtin") return h.kind === "builtin" && h.name === p.name;
  return h.kind === "type" && h.typeId === p.typeId;
}

// src/mock.ts
function getMockConfig() {
  if (typeof window === "undefined") return {};
  return window.__NETIZEN_MOCK__ ?? {};
}
function mockContext() {
  const cfg = getMockConfig();
  const query = {};
  if (typeof window !== "undefined") {
    new URLSearchParams(window.location.search).forEach((v, k) => {
      query[k] = v;
    });
  }
  const base = {
    user: {
      id: "0x0000000000000000000000000000000000000000",
      displayName: "Demo B\xFCrger:in",
      isCitizen: true
    },
    host: { name: "netizen-mock", platform: "web", version: "0.0.0" },
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    launch: { entry: "mock", query }
  };
  return { ...base, ...cfg.context, user: cfg.context?.user !== void 0 ? cfg.context.user : base.user };
}
function mockAccount() {
  const cfg = getMockConfig();
  return cfg.account !== void 0 ? cfg.account : null;
}
function mockBalance() {
  return getMockConfig().balance ?? { balance: "12", decimals: 18, symbol: "R\xD6" };
}
function mockCredentials() {
  return getMockConfig().credentials ?? [
    { type: "citizen", kind: "builtin", name: "B\xFCrger:in", recognised: true }
  ];
}
function mockHolds(pattern) {
  return mockCredentials().some((held) => credentialMatches(pattern, held));
}
function err2(code, message, rpcCode) {
  return rpcCode === void 0 ? { code, message } : { code, message, rpcCode };
}
var mockUserData = /* @__PURE__ */ new Map();
var announced = false;
function announceMockMode() {
  if (announced || typeof console === "undefined") return;
  announced = true;
  console.info(
    "[netizen] Kein R\xF6bel-Host erkannt \u2014 Mock-Modus aktiv. Wallet/Rewards sind deaktiviert. Konfiguration: window.__NETIZEN_MOCK__ \xB7 Docs: https://www.roebel.app/developers/mini-apps"
  );
}
function mockDispatch(method, params) {
  switch (method) {
    case "bridge.hello":
      return Promise.resolve({ ok: true, host: "netizen-mock" });
    case "actions.ready":
    case "actions.close":
    case "haptics.impact":
    case "haptics.notification":
    case "haptics.selection":
      return Promise.resolve(void 0);
    case "actions.openUrl": {
      const url = params?.url;
      if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener");
      return Promise.resolve(void 0);
    }
    case "actions.share": {
      const p = params ?? {};
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        return navigator.share({ text: p.text, url: p.url }).catch(() => void 0);
      }
      return Promise.resolve(void 0);
    }
    case "actions.addMiniApp":
      return Promise.resolve({ added: false });
    case "context.get":
      return Promise.resolve(mockContext());
    case "wallet.getAccount":
      return Promise.resolve(mockAccount());
    case "wallet.request": {
      const args = params ?? {};
      const account = mockAccount();
      switch (args.method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return Promise.resolve(account ? [account.address] : []);
        case "eth_chainId":
          return Promise.resolve(`0x${(account?.chainId ?? 100).toString(16)}`);
        case "net_version":
          return Promise.resolve(String(account?.chainId ?? 100));
        case "wallet_getCapabilities":
          return Promise.resolve({ "0x64": { atomic: { status: "supported" } } });
        case "wallet_switchEthereumChain": {
          const first = Array.isArray(args.params) ? args.params[0] : void 0;
          const chainId = typeof first?.chainId === "string" ? first.chainId.toLowerCase() : "";
          if (chainId === "0x64") return Promise.resolve(null);
          return Promise.reject(err2("unsupported", "Nur Gnosis (Chain 100) wird unterst\xFCtzt", 4902));
        }
        default:
          return Promise.reject(
            err2("unsupported", `Mock-Modus: "${args.method ?? "unknown"}" braucht den R\xF6bel-Host`)
          );
      }
    }
    case "auth.getToken": {
      const token = getMockConfig().token;
      return Promise.resolve(token ? { token } : null);
    }
    case "auth.signIn":
      return Promise.reject(err2("unsupported", "Mock-Modus: Anmeldung braucht den R\xF6bel-Host"));
    case "roebel.getMuenzenBalance":
      return Promise.resolve(mockBalance());
    case "roebel.grantReward": {
      const p = params;
      if (getMockConfig().rewards) {
        return Promise.resolve({ granted: true, amount: Math.min(p?.amount ?? 1, 1), txRef: "mock" });
      }
      return Promise.resolve({ granted: false, amount: 0 });
    }
    case "roebel.pay":
      return Promise.reject(err2("unsupported", "Mock-Modus: Zahlungen brauchen den R\xF6bel-Host"));
    case "notifications.send":
      return Promise.resolve({ sent: false });
    case "data.get": {
      const key = params?.key ?? "";
      const store2 = getMockConfig().data ?? {};
      const exists = Object.prototype.hasOwnProperty.call(store2, key);
      return Promise.resolve({ value: exists ? store2[key] : null, exists });
    }
    case "data.list": {
      const prefix = params?.prefix ?? "";
      const store2 = getMockConfig().data ?? {};
      const items = Object.keys(store2).filter((k) => k.startsWith(prefix)).sort().map((k) => ({ key: k, value: store2[k] }));
      return Promise.resolve({ items });
    }
    case "data.userGet": {
      const key = params?.key ?? "";
      const exists = mockUserData.has(key);
      return Promise.resolve({ value: exists ? mockUserData.get(key) : null, exists });
    }
    case "data.userSet": {
      const p = params ?? {};
      if (p.key) mockUserData.set(p.key, p.value ?? null);
      return Promise.resolve({ ok: true });
    }
    case "data.rows":
      return mockRows(params);
    case "credentials.list":
      return Promise.resolve(mockCredentials());
    case "credentials.has": {
      const type = params?.type;
      return Promise.resolve(typeof type === "string" && mockHolds(type));
    }
    case "credentials.request": {
      const types = params?.types;
      const list = Array.isArray(types) ? types.filter((t) => typeof t === "string") : [];
      return Promise.resolve({ granted: list.filter(mockHolds) });
    }
    case "analytics.track":
      return Promise.resolve(void 0);
    default:
      return Promise.reject(err2("unsupported", `Mock-Modus: Methode "${method}" nicht verf\xFCgbar`));
  }
}

// src/types.ts
var NETIZEN_PROTOCOL = 1;

// src/bridge.ts
var REQUEST_TIMEOUT_MS = 3e4;
var HELLO_TIMEOUT_MS = 2e3;
var HELLO_RETRY_MS = 400;
function uuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
var ClientBridge = class {
  constructor() {
    this.pending = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
    this.started = false;
    /** 'host' once the handshake was answered; 'mock' once we gave up waiting. */
    this.mode = "unknown";
    this.modeSettled = new Promise((resolve) => {
      this.settleMode = resolve;
    });
    /** Methods the host announced in its hello reply; null until/unless it sent a list. */
    this.announcedMethods = null;
    this.onMessage = (ev) => {
      const msg = parse(ev.data);
      if (!msg || msg.netizen !== NETIZEN_PROTOCOL) return;
      if ("id" in msg && msg.id && !("method" in msg)) {
        const res = msg;
        const p = this.pending.get(res.id);
        if (!p) return;
        this.pending.delete(res.id);
        clearTimeout(p.timer);
        if (res.error) p.reject(res.error);
        else p.resolve(res.result);
        return;
      }
      if ("event" in msg && msg.event) {
        this.dispatchEvent(msg.event, msg.data);
      }
    };
  }
  getMode() {
    return this.mode;
  }
  /** The host's method list from `bridge.hello`. null in mock mode or when the host sent none
   * (older hosts). */
  hostMethods() {
    return this.mode === "mock" ? null : this.announcedMethods;
  }
  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("message", this.onMessage);
  }
  /**
   * Probe for a Netizen host. Resolves once the mode is decided ('host' or
   * 'mock'). All other requests wait for this, so nothing hangs for 30s when
   * the app runs outside the Röbel app (plain tab, external editor preview).
   */
  handshake(sdkVersion) {
    if (typeof window === "undefined") {
      this.settle("mock", { silent: true });
      return Promise.resolve();
    }
    this.start();
    const id = uuid();
    const envelope = {
      netizen: NETIZEN_PROTOCOL,
      id,
      method: "bridge.hello",
      params: { sdkVersion }
    };
    return new Promise((resolve) => {
      let retry;
      const stopRetry = () => {
        if (retry !== void 0) clearInterval(retry);
      };
      const timer = setTimeout(() => {
        stopRetry();
        this.pending.delete(id);
        this.settle("mock");
        resolve();
      }, HELLO_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (result) => {
          stopRetry();
          const methods = result?.methods;
          if (Array.isArray(methods)) {
            this.announcedMethods = methods.filter((m) => typeof m === "string");
          }
          this.settle("host");
          resolve();
        },
        reject: () => {
          stopRetry();
          this.settle("host");
          resolve();
        },
        timer
      });
      try {
        post(envelope);
        retry = setInterval(() => {
          try {
            post(envelope);
          } catch {
          }
        }, HELLO_RETRY_MS);
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        this.settle("mock");
        resolve();
      }
    });
  }
  settle(mode, opts) {
    if (this.mode !== "unknown") return;
    this.mode = mode;
    this.settleMode();
    if (mode === "mock" && !opts?.silent) {
      announceMockMode();
      const account = getMockConfig().account;
      if (account) {
        setTimeout(() => this.dispatchEvent("walletChanged", account), 50);
      }
    }
  }
  dispatchEvent(event, data) {
    const set = this.listeners.get(event);
    if (set) for (const cb of set) safeCall(cb, data);
  }
  /**
   * Send a request and await the reply. Waits for the handshake to decide the
   * mode first; with no host present the request is answered by the local mock.
   */
  async request(method, params) {
    this.start();
    if (this.mode === "unknown") await this.modeSettled;
    if (this.mode === "mock") return mockDispatch(method, params);
    const id = uuid();
    const envelope = { netizen: NETIZEN_PROTOCOL, id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({ code: "timeout", message: `"${method}" timed out` });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        post(envelope);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject({ code: "internal", message: String(e) });
      }
    });
  }
  /** Fire-and-forget send (no reply awaited) — used by analytics.track. */
  notify(method, params) {
    this.start();
    void this.modeSettled.then(() => {
      if (this.mode !== "host") return;
      try {
        post({ netizen: NETIZEN_PROTOCOL, id: uuid(), method, params });
      } catch {
      }
    });
  }
  on(event, cb) {
    this.start();
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }
};
function post(envelope) {
  const w = window;
  const serialized = JSON.stringify(envelope);
  if (w.ReactNativeWebView) {
    w.ReactNativeWebView.postMessage(serialized);
  } else if (w.parent && w.parent !== w) {
    w.parent.postMessage(envelope, "*");
  } else {
    throw new Error("no Netizen host detected");
  }
}
function parse(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object" && data.netizen === NETIZEN_PROTOCOL) {
    return data;
  }
  return null;
}
function safeCall(cb, data) {
  try {
    cb(data);
  } catch {
  }
}

// src/env.ts
function getHostEnvironment() {
  if (typeof window === "undefined") return "standalone";
  if (window.ReactNativeWebView) return "webview";
  try {
    if (window.parent && window.parent !== window) return "iframe";
  } catch {
    return "iframe";
  }
  return "standalone";
}

// src/provider.ts
var PROVIDER_CODES = {
  user_rejected: 4001,
  unauthorized: 4100,
  invalid_params: -32602,
  rate_limited: -32005
};
function toProviderError(e) {
  const bridgeCode = e?.code ?? "internal";
  let code;
  if (bridgeCode === "unsupported") code = typeof e.rpcCode === "number" ? e.rpcCode : 4200;
  else code = PROVIDER_CODES[bridgeCode] ?? -32603;
  const err3 = new Error(e?.message ?? String(bridgeCode));
  err3.code = code;
  err3.data = { bridgeCode };
  return err3;
}
function createEip1193Provider(bridge) {
  const emitters = /* @__PURE__ */ new Map();
  const emit = (event, ...args) => {
    const set = emitters.get(event);
    if (set) for (const l of set) safe(l, args);
  };
  bridge.on("walletChanged", (data) => {
    const d = data ?? {};
    if (d.address) emit("accountsChanged", [d.address]);
    if (typeof d.chainId === "number") emit("chainChanged", `0x${d.chainId.toString(16)}`);
  });
  return {
    request(args) {
      return bridge.request("wallet.request", args).catch((e) => {
        throw toProviderError(asBridgeError(e));
      });
    },
    on(event, listener) {
      let set = emitters.get(event);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        emitters.set(event, set);
      }
      set.add(listener);
    },
    removeListener(event, listener) {
      emitters.get(event)?.delete(listener);
    }
  };
}
function asBridgeError(e) {
  if (e && typeof e === "object" && "code" in e && typeof e.code === "string") {
    return e;
  }
  return { code: "internal", message: e instanceof Error ? e.message : String(e) };
}
function safe(fn, args) {
  try {
    fn(...args);
  } catch {
  }
}

// src/client.ts
var SDK_VERSION = "0.5.0";
function createClient() {
  const bridge = new ClientBridge();
  let provider;
  const isReady = bridge.handshake(SDK_VERSION);
  const sdk2 = {
    isReady,
    actions: {
      ready: (opts) => bridge.request("actions.ready", opts ?? {}),
      close: () => bridge.request("actions.close"),
      openUrl: (url) => bridge.request("actions.openUrl", { url }),
      share: (payload) => bridge.request("actions.share", payload),
      addMiniApp: () => bridge.request("actions.addMiniApp")
    },
    getContext: () => bridge.request("context.get"),
    wallet: {
      getEthereumProvider: async () => {
        if (!provider) provider = createEip1193Provider(bridge);
        return provider;
      },
      getAccount: () => bridge.request("wallet.getAccount")
    },
    auth: {
      getToken: () => bridge.request("auth.getToken"),
      signIn: (opts) => bridge.request("auth.signIn", opts?.nonce ? { nonce: opts.nonce } : {})
    },
    haptics: {
      impact: (style) => bridge.request("haptics.impact", { style: style ?? "medium" }),
      notification: (type) => bridge.request("haptics.notification", { type: type ?? "success" }),
      selection: () => bridge.request("haptics.selection")
    },
    roebel: {
      getMuenzenBalance: () => bridge.request("roebel.getMuenzenBalance"),
      grantReward: (p) => bridge.request("roebel.grantReward", p),
      pay: (p) => bridge.request("roebel.pay", p)
    },
    notifications: {
      send: (p) => bridge.request("notifications.send", p)
    },
    track: (event, props) => bridge.notify("analytics.track", { event, props: props ?? {} }),
    on: (event, cb) => bridge.on(event, cb),
    data: {
      get: (key) => bridge.request("data.get", { key }),
      list: (prefix) => bridge.request("data.list", prefix ? { prefix } : {}),
      getUser: (key) => bridge.request("data.userGet", { key }),
      setUser: (key, value) => bridge.request("data.userSet", { key, value }),
      collection: (name, opts) => {
        const scope = opts?.scope ?? "shared";
        const call = (p) => bridge.request("data.rows", { collection: name, scope, ...p });
        return {
          list: (query) => call({ op: "list", query }),
          add: (row) => call({ op: "add", ...row }),
          update: (id, patch) => call({ op: "update", id, ...patch }),
          remove: (id) => call({ op: "remove", id })
        };
      }
    },
    credentials: {
      list: () => bridge.request("credentials.list"),
      has: (type) => bridge.request("credentials.has", { type }),
      request: (types) => bridge.request("credentials.request", { types }),
      onChange: (cb) => bridge.on("credentialsChanged", (data) => cb(data))
    },
    // Mock mode answers every method locally; an old host (no list) lets the call decide.
    supports: (method) => {
      const methods = bridge.hostMethods();
      return methods === null || methods.includes(method);
    },
    hostEnvironment: () => getHostEnvironment(),
    isMockMode: () => bridge.getMode() === "mock"
  };
  return sdk2;
}

// src/index.ts
var sdk = createClient();

export { BUILTIN_CREDENTIALS, NETIZEN_PROTOCOL, createClient, credentialMatches, getHostEnvironment, isCredentialRef, parseCredentialRef, sdk, toProviderError };
