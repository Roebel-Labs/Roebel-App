// Fetch for the web host's user-scoped mini-app calls (balance, rewards, user data).
// Client-safe and pure (no `window`, no `@/` alias) so node:test can load it.
//
// Every call carries `x-roebel-host: web`. When `getUserToken` yields a token it goes
// out as `Authorization: Bearer`; a 401 on such a call reports the token through
// `onUserTokenRejected` so the cache can drop it. There is no retry without the token:
// a request carrying a token is decided by the token alone.

export const WEB_HOST_HEADERS: Readonly<Record<string, string>> = { "x-roebel-host": "web" };

export interface UserFetchOptions {
  getUserToken?: () => Promise<string | null>;
  onUserTokenRejected?: (token: string) => void;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

export type UserFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function createUserFetch(opts: UserFetchOptions): UserFetch {
  return async (url, init = {}) => {
    const token = opts.getUserToken ? await opts.getUserToken().catch(() => null) : null;
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string> | undefined) ?? {}),
      ...WEB_HOST_HEADERS,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const doFetch = opts.fetch ?? fetch;
    const res = await doFetch(url, { ...init, headers });
    if (token && res.status === 401) {
      try {
        opts.onUserTokenRejected?.(token);
      } catch {
        // A cache callback must never fail the call.
      }
    }
    return res;
  };
}
