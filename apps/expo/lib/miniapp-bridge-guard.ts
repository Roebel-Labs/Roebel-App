/**
 * Bridge guard for the Expo mini-app host.
 *
 * Accepts a bridge message only when it comes from the mini app's own origin
 * and its top frame:
 *   - `nativeEvent.url` (the top frame's URL) must be on an allowed origin —
 *     catches a top frame that navigated away.
 *   - The script below runs before content loads (top frame only) and wraps
 *     `window.ReactNativeWebView.postMessage`, so every top-frame message
 *     carries a per-open nonce. A cross-origin sub-frame (which gets its own
 *     `ReactNativeWebView` on Android) cannot read that nonce.
 *
 * Unwrapped messages are accepted only until the first envelope was seen —
 * the fallback for a platform where the wrapper cannot install.
 */

/** JavaScript for `injectedJavaScriptBeforeContentLoaded` (main frame only). */
export function bridgeGuardScript(nonce: string): string {
  return (
    '(function(){var n=' +
    JSON.stringify(nonce) +
    ',native=window.ReactNativeWebView,w=null;\n' +
    'function wrap(t){return{postMessage:function(d){t.postMessage(JSON.stringify({nzf:n,d:String(d)}))}}}\n' +
    'function hello(){if(native){w=wrap(native);native.postMessage(JSON.stringify({nzf:n,hello:1}))}}\n' +
    "try{Object.defineProperty(window,'ReactNativeWebView',{configurable:true,\n" +
    'get:function(){return w},set:function(v){native=v;hello()}})}catch(e){}\n' +
    'hello()})();true;'
  );
}

export type BridgeGuard = {
  /** The inner message to hand to `bridge.handleMessage`, or `null` to drop. */
  accept(e: { data: string; url?: string }): string | null;
  envelopeSeen(): boolean;
};

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function createBridgeGuard(p: { nonce: string; allowedOrigins(): string[] }): BridgeGuard {
  let seen = false;
  return {
    accept({ data, url }) {
      // (1) top frame must be on the app's own origin
      const origin = url ? originOf(url) : null;
      if (!origin || !p.allowedOrigins().includes(origin)) return null;

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed === 'object' && 'nzf' in parsed) {
        const env = parsed as { nzf: unknown; hello?: unknown; d?: unknown };
        if (env.nzf === p.nonce) {
          // (2) hello
          if (env.hello === 1) {
            seen = true;
            return null;
          }
          // (3) wrapped message
          if (typeof env.d === 'string') {
            seen = true;
            return env.d;
          }
        } else {
          // (4) envelope with a foreign nonce
          return null;
        }
      }
      // (5) unwrapped: only while no envelope was seen
      return seen ? null : data;
    },
    envelopeSeen: () => seen,
  };
}
