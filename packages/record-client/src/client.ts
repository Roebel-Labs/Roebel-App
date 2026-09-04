/**
 * Transport core for reading a Netizen node's public index API over plain
 * HTTP — no API key, no account. This is the reference implementation of
 * the consumer contract documented in `CONSUMING_THE_RECORD.md`.
 *
 * Dependency-free and isomorphic (mirrors the discipline of `packages/nostr`):
 * `fetch` is injected for testability and defaults to the global one, so this
 * runs unmodified in Node, the browser, and Expo/Metro.
 */

export interface RecordEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string;
  node_id: string;
  source: string;
}

export interface EventFilters {
  kinds?: number[];
  authors?: string[];
  ids?: string[];
  e?: string[];
  p?: string[];
  d?: string[];
  since?: number;
  until?: number;
  q?: string;
  limit?: number;
  node?: string;
}

export class RecordUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordUnavailableError";
  }
}

export class RecordClient {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  /**
   * @param timeoutMs Wall-clock bound on each request. A node that is merely *down*
   * refuses the connection and `fetch` rejects promptly; a node whose host has
   * been deleted blackholes packets instead, and then `fetch` never settles at
   * all. Without this bound the caller's own error handling is unreachable — the
   * read does not fail, it hangs, which is worse than an error for a UI.
   */
  constructor(baseUrl: string, fetchFn: typeof fetch = fetch, timeoutMs = 10_000) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
  }

  async events(filters: EventFilters): Promise<RecordEvent[]> {
    const p = new URLSearchParams();
    const list = (k: string, v?: (string | number)[]) => {
      if (v?.length) p.set(k, v.join(","));
    };
    list("kinds", filters.kinds);
    list("authors", filters.authors);
    list("ids", filters.ids);
    list("e", filters.e);
    list("p", filters.p);
    list("d", filters.d);
    if (filters.since !== undefined) p.set("since", String(filters.since));
    if (filters.until !== undefined) p.set("until", String(filters.until));
    if (filters.q) p.set("q", filters.q);
    if (filters.node) p.set("node", filters.node);
    p.set("limit", String(filters.limit ?? 100));
    const body = await this.get(`/events?${p}`);
    return (body as { events?: RecordEvent[] }).events ?? [];
  }

  async manifest(): Promise<Record<string, unknown>> {
    return (await this.get("/manifest")) as Record<string, unknown>;
  }

  mediaUrl(sha256: string): string {
    return `${this.base}/media/${sha256}`;
  }

  private async get(path: string): Promise<unknown> {
    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      res = await this.fetchFn(`${this.base}${path}`, { signal: controller.signal });
    } catch (err) {
      throw new RecordUnavailableError(
        controller.signal.aborted
          ? `index timed out after ${this.timeoutMs}ms for ${path}`
          : `index unreachable: ${String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new RecordUnavailableError(`index answered ${res.status} for ${path}`);
    try {
      return await res.json();
    } catch (err) {
      throw new RecordUnavailableError(`index returned unparseable JSON for ${path}: ${String(err)}`);
    }
  }
}
