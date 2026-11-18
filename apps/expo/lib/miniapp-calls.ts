/**
 * Batches (EIP-5792 `wallet_sendCalls`), capabilities and gasless declared calls for mini apps.
 *
 * - `parseSendCalls` validates the 5792 request (Gnosis only, the person's own account, 1 to 10
 *   calls with a real `to`).
 * - `preflightCalls` decides BEFORE any sheet is shown whether a send may go out: an independent
 *   (passkey / 12 words) account sending for a version-2 app may only send that app's declared
 *   calls with no value; those sends carry the app id to the sponsor (mode "miniapp", gasless
 *   under the app's gas budget). Version-1 apps and the old sign-in keep today's path.
 * - `sponsorErrorToBridge` turns the sponsor's 403 / 429 answers into honest German messages.
 */
import { toFunctionSelector } from 'viem';
import { callRules, findDeclaredCall, type DeclaredContract } from '@netizen-labs/miniapp-sdk/host';
import { assertHostChain, HOST_CHAIN, type BridgeErrorLike } from '@/lib/miniapp-chain';
import type { MiniApp } from '@/lib/miniapps';

export const MAX_BATCH_CALLS = 10;

export type MiniAppCall = { to: string; data?: string; value?: string };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x[0-9a-fA-F]*$/;

export const NOT_RELEASED_MESSAGE = 'Diese Aktion ist für diese Mini-App nicht freigegeben.';

function invalid(message: string): BridgeErrorLike {
  return { code: 'invalid_params', message };
}

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v.length) {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Parse `wallet_sendCalls` params (`[{ version, chainId, from, calls, atomicRequired, capabilities }]`). */
export function parseSendCalls(params: unknown[], account: string): { calls: MiniAppCall[] } {
  const req = params[0];
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw invalid('wallet_sendCalls braucht ein Objekt.');
  const r = req as Record<string, unknown>;
  assertHostChain(r.chainId);
  if (r.from !== undefined) {
    if (typeof r.from !== 'string' || r.from.toLowerCase() !== account.toLowerCase()) {
      throw invalid('wallet_sendCalls: "from" ist nicht dein Konto.');
    }
  }
  if (!Array.isArray(r.calls) || r.calls.length === 0) throw invalid('wallet_sendCalls braucht mindestens eine Aktion.');
  if (r.calls.length > MAX_BATCH_CALLS) {
    throw invalid(`wallet_sendCalls erlaubt höchstens ${MAX_BATCH_CALLS} Aktionen.`);
  }
  const calls = r.calls.map((c): MiniAppCall => {
    if (!c || typeof c !== 'object') throw invalid('wallet_sendCalls: ungültige Aktion.');
    const call = c as Record<string, unknown>;
    if (typeof call.to !== 'string' || !ADDRESS.test(call.to)) throw invalid('wallet_sendCalls: jede Aktion braucht ein "to".');
    if (call.data !== undefined && (typeof call.data !== 'string' || !HEX.test(call.data))) {
      throw invalid('wallet_sendCalls: "data" muss Hex sein.');
    }
    if (call.value !== undefined && (typeof call.value !== 'string' || !HEX.test(call.value))) {
      throw invalid('wallet_sendCalls: "value" muss Hex sein.');
    }
    if (call.chainId !== undefined) assertHostChain(call.chainId);
    return {
      to: call.to,
      ...(call.data !== undefined ? { data: call.data as string } : {}),
      ...(call.value !== undefined ? { value: call.value as string } : {}),
    };
  });
  return { calls };
}

export function preflightCalls(p: {
  app: Pick<MiniApp, 'contracts'> & { manifestVersion?: 1 | 2 };
  calls: { to?: string; data?: string; value?: string }[];
  sponsored: boolean;
}): { ok: true; miniAppId: boolean } | { ok: false; error: BridgeErrorLike } {
  if (!p.sponsored || p.app.manifestVersion !== 2) return { ok: true, miniAppId: false };
  const rules = callRules((p.app.contracts ?? []) as DeclaredContract[], (sig) => toFunctionSelector(sig));
  const allDeclared = p.calls.every(
    (c) => toBigIntSafe(c.value) === 0n && findDeclaredCall(rules, c.to, c.data) !== null,
  );
  if (!allDeclared) return { ok: false, error: { code: 'unauthorized', message: NOT_RELEASED_MESSAGE } };
  return { ok: true, miniAppId: true };
}

/** EIP-5792 `wallet_getCapabilities`: atomic batches on Gnosis. */
export function capabilities(): Record<string, unknown> {
  return { [`0x${HOST_CHAIN.toString(16)}`]: { atomic: { status: 'supported' } } };
}

/** EIP-5792 `wallet_getCallsStatus`. The batch id is the transaction hash of the send. */
export async function callsStatus(
  id: string,
  getReceipt: (hash: string) => Promise<{ status?: unknown } | null>,
): Promise<{ version: '2.0.0'; id: string; chainId: '0x64'; status: 100 | 200 | 500; atomic: true; receipts?: unknown[] }> {
  const base = { version: '2.0.0' as const, id, chainId: '0x64' as const, atomic: true as const };
  const receipt = await getReceipt(id);
  if (!receipt) return { ...base, status: 100 };
  return { ...base, status: receipt.status === '0x1' ? 200 : 500, receipts: [receipt] };
}

/**
 * The sponsor's refusal of a mini-app op as a bridge error, or null when `e` is something else.
 * (`sendSafeUserOp` throws HTTP errors with `status` and the JSON `body`.)
 */
export function sponsorErrorToBridge(e: unknown): BridgeErrorLike | null {
  if (!e || typeof e !== 'object') return null;
  const status = (e as { status?: unknown }).status;
  const body = (e as { body?: unknown }).body as { scope?: unknown } | null | undefined;
  if (status === 403) return { code: 'unauthorized', message: NOT_RELEASED_MESSAGE };
  if (status === 429) {
    switch (body?.scope) {
      case 'app':
        return { code: 'budget_exceeded', message: 'Das Gas-Budget dieser Mini-App ist aufgebraucht.' };
      case 'person':
        return { code: 'budget_exceeded', message: 'Du hast dein Tageslimit für Mini-Apps erreicht. Morgen geht es weiter.' };
      case 'global':
        return { code: 'budget_exceeded', message: 'Mini-Apps sind heute ausgelastet. Bitte versuch es morgen wieder.' };
      default:
        return null;
    }
  }
  return null;
}
