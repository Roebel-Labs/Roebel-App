var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
function err(code, message) {
  return { code, message };
}
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
        default:
          return Promise.reject(
            err("unsupported", `Mock-Modus: "${args.method ?? "unknown"}" braucht den R\xF6bel-Host`)
          );
      }
    }
    case "auth.getToken":
      return Promise.resolve(null);
    case "auth.signIn":
      return Promise.reject(err("unsupported", "Mock-Modus: Anmeldung braucht den R\xF6bel-Host"));
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
      return Promise.reject(err("unsupported", "Mock-Modus: Zahlungen brauchen den R\xF6bel-Host"));
    case "notifications.send":
      return Promise.resolve({ sent: false });
    case "analytics.track":
      return Promise.resolve(void 0);
    default:
      return Promise.reject(err("unsupported", `Mock-Modus: Methode "${method}" nicht verf\xFCgbar`));
  }
}

// src/types.ts
var NETIZEN_PROTOCOL = 1;

// src/bridge.ts
var REQUEST_TIMEOUT_MS = 3e4;
var HELLO_TIMEOUT_MS = 1500;
function uuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
var ClientBridge = class {
  constructor() {
    __publicField(this, "pending", /* @__PURE__ */ new Map());
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
    __publicField(this, "started", false);
    /** 'host' once the handshake was answered; 'mock' once we gave up waiting. */
    __publicField(this, "mode", "unknown");
    __publicField(this, "settleMode");
    __publicField(this, "modeSettled", new Promise((resolve) => {
      this.settleMode = resolve;
    }));
    __publicField(this, "onMessage", (ev) => {
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
    });
  }
  getMode() {
    return this.mode;
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.settle("mock");
        resolve();
      }, HELLO_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: () => {
          this.settle("host");
          resolve();
        },
        reject: () => {
          this.settle("host");
          resolve();
        },
        timer
      });
      try {
        post(envelope);
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
      return bridge.request("wallet.request", args);
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
function safe(fn, args) {
  try {
    fn(...args);
  } catch {
  }
}

// src/client.ts
var SDK_VERSION = "0.2.0";
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
      signIn: () => bridge.request("auth.signIn")
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
    hostEnvironment: () => getHostEnvironment(),
    isMockMode: () => bridge.getMode() === "mock"
  };
  return sdk2;
}

// src/index.ts
var sdk = createClient();

export { NETIZEN_PROTOCOL, createClient, getHostEnvironment, sdk };
