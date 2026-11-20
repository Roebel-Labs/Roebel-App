/**
 * Read-only chain access for mini apps, answered by the host against the community's RPC.
 *
 * A mini app asks its injected EIP-1193 provider for standard reads (`eth_call`, `eth_getLogs`,
 * …). The host forwards them here; this module sends ONE JSON-RPC call per request to the
 * configured RPC, with limits so a mini app can neither hang the app nor hammer the RPC:
 *  - a token bucket (30 burst, refilled at 5 per second = 300 per minute);
 *  - a 10 s timeout through an AbortController (React Native fetch never times out by itself);
 *  - request and response size caps;
 *  - `eth_getLogs` needs an address (up to 5) unless it asks by blockHash, both bounds, and at
 *    most 10,000 blocks; more than 1,000 results are refused;
 *  - `eth_getBlockByNumber` returns transaction hashes only.
 *
 * Errors are bridge errors (`{ code, message }`, plus `rpcCode` for an error the RPC sent).
 */

export const RPC_LIMITS = {
  timeoutMs: 10_000,
  maxRequestBytes: 65_536,
  maxResponseBytes: 1_048_576,
  logsMaxBlockRange: 10_000,
  logsMaxAddresses: 5,
  logsMaxResults: 1_000,
  perMinute: 300,
  burst: 30,
} as const;

/** The read methods the host forwards to the RPC. Everything else is answered by the host or refused. */
export const PROXIED_METHODS: readonly string[] = [
  'eth_call',
  'eth_getBalance',
  'eth_getLogs',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_blockNumber',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
];

/** How long a resolved `latest` block number is reused for range checks. */
const BLOCK_NUMBER_CACHE_MS = 5_000;

export type RpcBridgeError = { code: string; message: string; rpcCode?: number };

export interface RpcProxy {
  request(method: string, params: unknown[], ctx: { account?: string }): Promise<unknown>;
}

function err(code: string, message: string, rpcCode?: number): RpcBridgeError {
  return rpcCode === undefined ? { code, message } : { code, message, rpcCode };
}

const HEX_QTY = /^0x[0-9a-fA-F]{1,64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Byte length of a string as UTF-8 (no TextEncoder dependency). */
function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function createRpcProxy(deps: {
  rpcUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}): RpcProxy {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const refillPerMs = RPC_LIMITS.perMinute / 60_000;

  let tokens: number = RPC_LIMITS.burst;
  let lastRefill = now();
  let nextId = 1;
  let blockCache: { value: bigint; at: number } | null = null;

  function takeToken(): boolean {
    const t = now();
    tokens = Math.min(RPC_LIMITS.burst, tokens + (t - lastRefill) * refillPerMs);
    lastRefill = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  }

  async function call(method: string, params: unknown[]): Promise<unknown> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
    if (utf8Length(body) > RPC_LIMITS.maxRequestBytes) {
      throw err('invalid_params', 'Die Anfrage ist zu groß.');
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(err('timeout', 'Die Blockchain antwortet nicht.'));
      }, RPC_LIMITS.timeoutMs);
    });
    try {
      const run = (async () => {
        let res: Response;
        try {
          res = await doFetch(deps.rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            signal: controller.signal,
          });
        } catch {
          throw err('internal', 'Die Blockchain ist nicht erreichbar.');
        }
        const text = await res.text();
        if (utf8Length(text) > RPC_LIMITS.maxResponseBytes) {
          throw err('internal', 'Die Antwort der Blockchain ist zu groß.');
        }
        let json: { result?: unknown; error?: { code?: unknown; message?: unknown } };
        try {
          json = JSON.parse(text);
        } catch {
          throw err('internal', 'Die Blockchain hat ungültig geantwortet.');
        }
        if (json && typeof json === 'object' && json.error) {
          const e = json.error;
          throw err(
            'internal',
            typeof e.message === 'string' ? e.message : 'Fehler der Blockchain.',
            typeof e.code === 'number' ? e.code : undefined,
          );
        }
        if (!res.ok) throw err('internal', `Die Blockchain antwortet mit ${res.status}.`);
        return json?.result ?? null;
      })();
      return await Promise.race([run, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function latestBlock(): Promise<bigint> {
    const t = now();
    if (blockCache && t - blockCache.at < BLOCK_NUMBER_CACHE_MS) return blockCache.value;
    const raw = await call('eth_blockNumber', []);
    if (typeof raw !== 'string' || !HEX_QTY.test(raw)) {
      throw err('internal', 'Die Blockchain hat ungültig geantwortet.');
    }
    blockCache = { value: BigInt(raw), at: t };
    return blockCache.value;
  }

  async function resolveBound(v: unknown): Promise<bigint> {
    if (v === 'latest') return latestBlock();
    if (typeof v === 'string' && HEX_QTY.test(v)) return BigInt(v);
    throw err('invalid_params', 'fromBlock und toBlock müssen als Blocknummer oder "latest" angegeben sein.');
  }

  async function checkLogsFilter(filter: unknown): Promise<void> {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw err('invalid_params', 'eth_getLogs braucht einen Filter.');
    }
    const f = filter as Record<string, unknown>;
    const addresses = f.address === undefined ? [] : Array.isArray(f.address) ? f.address : [f.address];
    if (addresses.length > RPC_LIMITS.logsMaxAddresses) {
      throw err('invalid_params', `eth_getLogs erlaubt höchstens ${RPC_LIMITS.logsMaxAddresses} Adressen.`);
    }
    if (!addresses.every((a) => typeof a === 'string' && ADDRESS.test(a))) {
      throw err('invalid_params', 'eth_getLogs: ungültige Adresse.');
    }
    if (f.blockHash !== undefined) {
      if (f.fromBlock !== undefined || f.toBlock !== undefined) {
        throw err('invalid_params', 'eth_getLogs: blockHash schließt fromBlock und toBlock aus.');
      }
      return;
    }
    if (addresses.length === 0) throw err('invalid_params', 'eth_getLogs braucht eine Vertragsadresse.');
    if (f.fromBlock === undefined || f.toBlock === undefined) {
      throw err('invalid_params', 'eth_getLogs braucht fromBlock und toBlock.');
    }
    const from = await resolveBound(f.fromBlock);
    const to = await resolveBound(f.toBlock);
    if (to < from) throw err('invalid_params', 'eth_getLogs: toBlock liegt vor fromBlock.');
    if (to - from > BigInt(RPC_LIMITS.logsMaxBlockRange)) {
      throw err('invalid_params', `eth_getLogs erlaubt höchstens ${RPC_LIMITS.logsMaxBlockRange} Blöcke.`);
    }
  }

  function withFrom(params: unknown[], account: string | undefined): unknown[] {
    const [txObj, ...rest] = params;
    if (!account || !txObj || typeof txObj !== 'object' || Array.isArray(txObj)) return params;
    if ((txObj as Record<string, unknown>).from !== undefined) return params;
    return [{ ...(txObj as Record<string, unknown>), from: account }, ...rest];
  }

  return {
    async request(method, params, ctx) {
      if (!PROXIED_METHODS.includes(method)) {
        throw err('unsupported', `Methode "${method}" wird nicht unterstützt.`);
      }
      if (!takeToken()) throw err('rate_limited', 'Zu viele Anfragen. Bitte kurz warten.');
      const p = Array.isArray(params) ? params : [];

      if (method === 'eth_getLogs') {
        await checkLogsFilter(p[0]);
        const logs = await call(method, [p[0]]);
        if (Array.isArray(logs) && logs.length > RPC_LIMITS.logsMaxResults) {
          throw err('rate_limited', 'Zu viele Ergebnisse. Grenze den Blockbereich ein.');
        }
        return logs;
      }
      if (method === 'eth_getBlockByNumber') {
        return call(method, [p[0] ?? 'latest', false]);
      }
      if (method === 'eth_call' || method === 'eth_estimateGas') {
        return call(method, withFrom(p, ctx.account));
      }
      return call(method, p);
    },
  };
}
