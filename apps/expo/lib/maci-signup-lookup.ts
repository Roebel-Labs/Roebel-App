/**
 * MACI SignUp lookup + July-key recovery decision logic.
 *
 * Pure module: every network/wallet dependency is injected, so the whole
 * decision tree is unit-testable (see lib/__tests__/maci-signup-lookup.test.ts).
 *
 * Why this exists (2026-09-29 incident): the old lookup scanned SignUp logs
 * from the MACI deploy block to `latest` in ~180 RPC windows; one failed
 * window made the status `unknown` and citizens could not vote. And every
 * citizen who registered in July (when the app's primary chain was Base) and
 * later lost the local key re-derives a DIFFERENT key today, because the
 * smart-account signature embeds the chain id. See lib/maci-legacy-key.ts.
 */

/** keccak256("SignUp(uint256,uint256,uint256,uint256,uint256)") */
export const SIGN_UP_TOPIC0 =
  "0xd3c3cd829e4e37d5baaf10abace26b24e0046e20500c999380410f807edfcda0";

/** Etherscan-compatible log APIs for Gnosis. gnosis.blockscout.com currently
 *  301-redirects to gnosisscan.io (fetch follows it); both are tried. */
export const EXPLORER_API_URLS = [
  "https://gnosis.blockscout.com/api",
  "https://gnosisscan.io/api",
] as const;

export type LookupResult =
  | { kind: "found"; stateIndex: bigint }
  | { kind: "not-found" }
  | { kind: "error"; reason: string };

function toTopic(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

function sameWord(a: unknown, b: bigint): boolean {
  if (typeof a !== "string" || !/^0x[0-9a-fA-F]+$/.test(a)) return false;
  try {
    return BigInt(a) === b;
  } catch {
    return false;
  }
}

/**
 * Parse an Etherscan-style `module=logs&action=getLogs` response.
 *
 * - status "1" + a log whose topics match pubX/pubY → found (stateIndex = the
 *   first 32-byte word of `data`).
 * - status "0" + "No logs found" (empty result) → a clean not-found.
 * - anything else (rate limit, HTML, non-matching logs = filter ignored) → error,
 *   so the caller falls back instead of wrongly reporting "not registered".
 */
export function parseExplorerSignUpResponse(
  json: unknown,
  pubX: bigint,
  pubY: bigint,
  maciAddress: string,
): LookupResult {
  if (!json || typeof json !== "object") return { kind: "error", reason: "no json body" };
  const body = json as { status?: unknown; message?: unknown; result?: unknown };
  const result = body.result;
  if (!Array.isArray(result)) {
    return { kind: "error", reason: `unexpected result: ${String(body.message ?? body.result)}` };
  }
  if (result.length === 0) {
    if (body.status === "1" || /no (logs|records) found/i.test(String(body.message ?? ""))) {
      return { kind: "not-found" };
    }
    return { kind: "error", reason: `empty result with status ${String(body.status)}: ${String(body.message)}` };
  }
  for (const raw of result) {
    const log = raw as { address?: unknown; topics?: unknown; data?: unknown };
    const topics = Array.isArray(log.topics) ? log.topics : [];
    if (
      typeof log.address === "string" &&
      log.address.toLowerCase() === maciAddress.toLowerCase() &&
      typeof topics[0] === "string" &&
      topics[0].toLowerCase() === SIGN_UP_TOPIC0 &&
      sameWord(topics[1], pubX) &&
      sameWord(topics[2], pubY) &&
      typeof log.data === "string" &&
      /^0x[0-9a-fA-F]{64}/.test(log.data)
    ) {
      return { kind: "found", stateIndex: BigInt(log.data.slice(0, 66)) };
    }
  }
  // Logs came back but none is ours → the topic filter was not applied.
  return { kind: "error", reason: "explorer returned non-matching logs" };
}

export function buildExplorerSignUpUrl(
  baseUrl: string,
  args: { maciAddress: string; fromBlock: bigint; pubX: bigint; pubY: bigint },
): string {
  const q = [
    "module=logs",
    "action=getLogs",
    `fromBlock=${args.fromBlock.toString()}`,
    "toBlock=latest",
    `address=${args.maciAddress}`,
    `topic0=${SIGN_UP_TOPIC0}`,
    `topic1=${toTopic(args.pubX)}`,
    `topic2=${toTopic(args.pubY)}`,
    "topic0_1_opr=and",
    "topic1_2_opr=and",
    "topic0_2_opr=and",
  ].join("&");
  return `${baseUrl}?${q}`;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** One explorer request per host (first conclusive answer wins), each bounded
 *  by an AbortController timeout. RN fetch never times out on its own. */
export async function lookupSignUpViaExplorer(args: {
  pubX: bigint;
  pubY: bigint;
  maciAddress: string;
  fromBlock: bigint;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  urls?: readonly string[];
}): Promise<LookupResult> {
  const fetchImpl = args.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = args.timeoutMs ?? 10_000;
  let lastError = "no explorer url";
  for (const base of args.urls ?? EXPLORER_API_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(buildExplorerSignUpUrl(base, args), {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        lastError = `${base}: http ${res.status}`;
        continue;
      }
      const parsed = parseExplorerSignUpResponse(await res.json(), args.pubX, args.pubY, args.maciAddress);
      if (parsed.kind !== "error") return parsed;
      lastError = `${base}: ${parsed.reason}`;
    } catch (err) {
      lastError = `${base}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      clearTimeout(timer);
    }
  }
  return { kind: "error", reason: lastError };
}

/**
 * Fallback over RPC. First ONE full-range eth_getLogs (rpc.gnosischain.com
 * accepts the whole topic-filtered range as of 2026-09-29); if the node
 * rejects that, scan in block windows, gently (concurrency 2, 3 attempts per
 * window with backoff). Returns `error` only if a window failed all attempts
 * and no hit was found anywhere.
 */
export async function lookupSignUpViaRpcScan(args: {
  fromBlock: bigint;
  getLatestBlock: () => Promise<bigint>;
  /** Returns the stateIndex of this pubkey's SignUp inside [from, to], or null. */
  getSignUpInWindow: (from: bigint, to: bigint) => Promise<bigint | null>;
  windowSize?: bigint;
  concurrency?: number;
  attempts?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  tryFullRangeFirst?: boolean;
}): Promise<LookupResult> {
  const windowSize = args.windowSize ?? 9_000n;
  const concurrency = args.concurrency ?? 2;
  const attempts = args.attempts ?? 3;
  const backoffMs = args.backoffMs ?? 500;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let latest: bigint;
  try {
    latest = await args.getLatestBlock();
  } catch (err) {
    return { kind: "error", reason: `latest block: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (args.tryFullRangeFirst !== false) {
    try {
      const idx = await args.getSignUpInWindow(args.fromBlock, latest);
      return idx !== null ? { kind: "found", stateIndex: idx } : { kind: "not-found" };
    } catch {
      // range too large for this node → windowed scan below
    }
  }

  const ranges: { from: bigint; to: bigint }[] = [];
  for (let to = latest; to >= args.fromBlock; ) {
    const from = to - windowSize + 1n > args.fromBlock ? to - windowSize + 1n : args.fromBlock;
    ranges.push({ from, to });
    if (from === args.fromBlock) break;
    to = from - 1n;
  }

  let hit: bigint | null = null;
  let failed = 0;
  let cursor = 0;

  const scanWindow = async (r: { from: bigint; to: bigint }) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const idx = await args.getSignUpInWindow(r.from, r.to);
        if (idx !== null && hit === null) hit = idx;
        return;
      } catch {
        if (attempt < attempts - 1) await sleep(backoffMs * 2 ** attempt);
      }
    }
    failed++;
  };

  const worker = async () => {
    while (hit === null && cursor < ranges.length) {
      await scanWindow(ranges[cursor++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, () => worker()));

  if (hit !== null) return { kind: "found", stateIndex: hit };
  if (failed > 0) return { kind: "error", reason: `${failed}/${ranges.length} windows failed` };
  return { kind: "not-found" };
}

/** Explorer first (one request), RPC window scan only if the explorer fails. */
export async function findSignUpStateIndex(
  pubX: bigint,
  pubY: bigint,
  deps: {
    explorer: (pubX: bigint, pubY: bigint) => Promise<LookupResult>;
    rpcScan: (pubX: bigint, pubY: bigint) => Promise<LookupResult>;
    log?: (msg: string) => void;
  },
): Promise<LookupResult> {
  const viaExplorer = await deps.explorer(pubX, pubY);
  if (viaExplorer.kind !== "error") return viaExplorer;
  deps.log?.(`explorer lookup failed (${viaExplorer.reason}) → RPC scan`);
  return deps.rpcScan(pubX, pubY);
}

export interface KeyCandidate {
  pubX: bigint;
  pubY: bigint;
}

export type RecoveryOutcome<K extends KeyCandidate> =
  | { kind: "current"; stateIndex: bigint }
  | { kind: "legacy"; key: K; stateIndex: bigint }
  | { kind: "needs-signup" }
  | { kind: "lost-key" }
  | { kind: "unknown"; reason: string };

/**
 * Decide the sign-up state for the current key, recovering the July
 * (Base-signed) key when the citizen's token is already registered.
 *
 *   current key has a SignUp                  → current
 *   lookup failed                             → unknown (retry)
 *   no SignUp, token not registered           → needs-signup
 *   no SignUp, token registered / AlreadyReg. → try legacy keys:
 *        a legacy key has a SignUp            → legacy (persist it)
 *        all legacy keys cleanly absent       → lost-key (contact support)
 *        derivation / lookup failed           → unknown (retry)
 */
export async function resolveSignUpWithRecovery<K extends KeyCandidate>(args: {
  current: KeyCandidate;
  lookup: (pubX: bigint, pubY: bigint) => Promise<LookupResult>;
  /** true = the citizen's token already signed up at the gatekeeper;
   *  false = it has not; null = unknown / no token. */
  isTokenRegistered: () => Promise<boolean | null>;
  deriveLegacyCandidates: () => Promise<K[]>;
  /** Set after an AlreadyRegistered revert: skip the token read. */
  alreadyRegistered?: boolean;
}): Promise<RecoveryOutcome<K>> {
  const current = await args.lookup(args.current.pubX, args.current.pubY);
  if (current.kind === "found") return { kind: "current", stateIndex: current.stateIndex };
  if (current.kind === "error") return { kind: "unknown", reason: current.reason };

  let registered: boolean | null = args.alreadyRegistered ? true : null;
  if (!registered) {
    try {
      registered = await args.isTokenRegistered();
    } catch {
      registered = null;
    }
  }
  if (registered !== true) return { kind: "needs-signup" };

  let candidates: K[];
  try {
    candidates = await args.deriveLegacyCandidates();
  } catch (err) {
    return { kind: "unknown", reason: `legacy derivation: ${err instanceof Error ? err.message : String(err)}` };
  }

  let anyError: string | null = null;
  for (const c of candidates) {
    if (c.pubX === args.current.pubX && c.pubY === args.current.pubY) continue;
    const res = await args.lookup(c.pubX, c.pubY);
    if (res.kind === "found") return { kind: "legacy", key: c, stateIndex: res.stateIndex };
    if (res.kind === "error") anyError = res.reason;
  }
  if (anyError) return { kind: "unknown", reason: anyError };
  return { kind: "lost-key" };
}
