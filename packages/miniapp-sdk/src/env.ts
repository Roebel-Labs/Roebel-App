/**
 * Host-environment detection (transport heuristic).
 *
 * NOTE: 'iframe' only means "embedded in SOME parent frame" — it may be a
 * foreign embedder (e.g. an external editor's preview pane), not a Netizen
 * host. Whether a real host is present is decided by the bridge handshake
 * (`bridge.hello` answered within the handshake window); see `sdk.isMockMode()`.
 */
export type HostEnvironment = 'webview' | 'iframe' | 'standalone';

export function getHostEnvironment(): HostEnvironment {
  if (typeof window === 'undefined') return 'standalone';
  if (window.ReactNativeWebView) return 'webview';
  try {
    if (window.parent && window.parent !== window) return 'iframe';
  } catch {
    // cross-origin parent access can throw in exotic sandboxes — treat as embedded
    return 'iframe';
  }
  return 'standalone';
}
