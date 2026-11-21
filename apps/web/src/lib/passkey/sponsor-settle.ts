/**
 * Settle path of the passkey sponsor budget (security review M-2, owner decision 2026-11-21:
 * "reserve the max prefund when a voucher is issued, settle to the actual gas once the op landed").
 *
 * POST /api/passkey/sponsor/settle  { chainId: 100, userOpHash }
 *   The app calls it after the receipt of a device-session op. The SERVER reads the EntryPoint
 *   v0.7 `UserOperationEvent` for that userOpHash (paymaster = ours, from chain), derives the
 *   reservation id `<sender>:<nonce>` from the EVENT (never from the request) and settles the
 *   reservation to the event's `actualGasCost` (capped at the reserved amount). Nothing the client
 *   sends besides the hash is used; a client can neither name an amount nor another reservation.
 *   Response: 200 { status: 'settled' | 'already_settled' | 'unknown' }
 *           | 404 { error: 'not_found' }  (no event for that hash + our paymaster yet; the sweep retries)
 *           | 400 { error: 'bad_request' } | 503 { error: 'disabled' | 'chain_unavailable' }
 *
 * Lazy sweep (`sweepExpiredReservations`): open reservations whose voucher validUntil passed more
 * than SWEEP_GRACE_SEC ago can no longer land (the paymaster's validUntil). For each, the server
 * looks for the event by (sender, our paymaster) and the reservation's nonce: found = settle to
 * actualGasCost (the client never reported it), not found = release. A failed chain read leaves the
 * reservation charged (fail safe). Runs bounded on every settle call and, for the requesting
 * Safe's own key, before each session-op reservation in the sponsor handler.
 */
import { NextResponse } from "next/server";
import { isAddress, isAddressEqual, type Hex } from "viem";
import { reservationIdOf, type SponsorBudget } from "./sponsor-budget";

/** EntryPoint v0.7 on Gnosis. */
export const ENTRY_POINT_V07: Hex = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/** One EntryPoint v0.7 UserOperationEvent. */
export interface UserOpEvent {
  userOpHash: Hex;
  sender: Hex;
  paymaster: Hex;
  nonce: bigint;
  success: boolean;
  /** Wei the EntryPoint took from the paymaster's deposit (this is what the budget is settled to). */
  actualGasCost: bigint;
}

export interface UserOpEventReader {
  /**
   * UserOperationEvents of the EntryPoint emitted in roughly the last `sinceSeconds`, filtered by
   * the paymaster and by the userOpHash and / or the sender (indexed topics). Throws on transport errors.
   */
  userOperationEvents(f: { paymaster: Hex; userOpHash?: Hex; sender?: Hex; sinceSeconds: number }): Promise<readonly UserOpEvent[]>;
}

/** An expired voucher is swept only after this grace (log indexing lag of the RPC). */
export const SWEEP_GRACE_SEC = 120;
/** The settle endpoint looks back this far for the event. */
export const SETTLE_LOOKBACK_SEC = 86_400;

function errName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/**
 * Settles or releases up to `limit` expired open reservations (optionally of one budget key).
 * Never throws: a store or chain failure stops / skips (the reservation stays charged).
 */
export async function sweepExpiredReservations(
  budget: SponsorBudget,
  events: UserOpEventReader,
  paymaster: Hex,
  o: { nowSeconds: number; budgetKey?: string; limit: number },
): Promise<{ settled: number; released: number }> {
  const out = { settled: 0, released: 0 };
  if (!budget.expiredReservations || !budget.settle || !budget.release) return out;
  let expired;
  try {
    expired = await budget.expiredReservations({ beforeSeconds: o.nowSeconds - SWEEP_GRACE_SEC, budgetKey: o.budgetKey, limit: o.limit });
  } catch (err) {
    console.error("[passkey-sponsor] sweep: budget store unavailable:", errName(err));
    return out;
  }
  for (const r of expired) {
    try {
      const evs = await events.userOperationEvents({
        paymaster,
        sender: r.sender,
        sinceSeconds: Math.max(0, o.nowSeconds - r.createdAt) + SWEEP_GRACE_SEC,
      });
      const landed = evs.find(
        (e) => isAddressEqual(e.paymaster, paymaster) && isAddressEqual(e.sender, r.sender) && e.nonce === r.nonce,
      );
      if (landed) {
        if ((await budget.settle(r.id, landed.actualGasCost)) === "settled") out.settled++;
      } else if (await budget.release(r.id)) {
        out.released++;
      }
    } catch (err) {
      console.error("[passkey-sponsor] sweep: skipped one reservation:", errName(err));
    }
  }
  return out;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;

export async function handleSponsorSettle(
  request: Request,
  deps: { budget: SponsorBudget; events: UserOpEventReader; nowSeconds?: () => number },
) {
  const paymaster = process.env.PASSKEY_PAYMASTER_ADDRESS ?? "";
  if (process.env.PASSKEY_SPONSOR_ENABLED !== "1" || !isAddress(paymaster, { strict: false }) || !deps.budget.settle) {
    return NextResponse.json({ error: "disabled" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const b = body as { chainId?: unknown; userOpHash?: unknown } | null;
  if (!b || typeof b !== "object" || b.chainId !== 100 || typeof b.userOpHash !== "string" || !HASH.test(b.userOpHash)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const userOpHash = b.userOpHash.toLowerCase() as Hex;
  const now = deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000);

  let event: UserOpEvent | undefined;
  try {
    const evs = await deps.events.userOperationEvents({ paymaster: paymaster as Hex, userOpHash, sinceSeconds: SETTLE_LOOKBACK_SEC });
    // Re-check what the topic filter promised: our paymaster, this hash.
    event = evs.find((e) => e.userOpHash.toLowerCase() === userOpHash && isAddressEqual(e.paymaster, paymaster as Hex));
  } catch (err) {
    console.error("[passkey-sponsor] settle: chain read failed:", errName(err));
    return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
  }

  let status: string | null = null;
  if (event) {
    try {
      status = await deps.budget.settle(reservationIdOf(event.sender, event.nonce), event.actualGasCost);
    } catch (err) {
      console.error("[passkey-sponsor] settle: budget unavailable:", errName(err));
      return NextResponse.json({ error: "chain_unavailable" }, { status: 503 });
    }
  }
  // Lazy sweep of other expired reservations (bounded; never fails the request).
  await sweepExpiredReservations(deps.budget, deps.events, paymaster as Hex, { nowSeconds: now, limit: 5 });

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status });
}
