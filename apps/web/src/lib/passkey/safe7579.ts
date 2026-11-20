/**
 * Safe7579 root-op parsing for the sponsor policy (migrated passkey Safes).
 *
 * After the device-session upgrade a passkey Safe runs on the Safe7579 adapter
 * (fallback handler + module) instead of Safe4337Module. Its root ops (nonce key 0,
 * validated by Safe.checkSignatures) carry `Safe7579.execute(bytes32 mode, bytes
 * executionCalldata)`. This module decodes exactly the two modes the app builds
 * (`encode7579Execute` in session-keys-builders.ts) and nothing else:
 *
 *  - EXEC_SINGLE = 0x00…00: callType 0x00 (single), execType 0x00 (default/revert),
 *    unused + selector + payload all zero. executionCalldata = target (20) ++ uint256
 *    value (32) ++ callData.
 *  - EXEC_BATCH = 0x01 << 248: callType 0x01 (batch), everything else zero.
 *    executionCalldata = abi.encode(Execution[]) in canonical form.
 *
 * Every other mode word is refused: callType 0xff (DELEGATECALL, would run arbitrary
 * code in the Safe's context), 0xfe (static), execType 0x01 (try), any non-zero
 * selector or payload byte. The outer calldata and the batch payload must be the
 * canonical ABI encoding (re-encoded and compared byte for byte), so the bytes the
 * policy reads are the bytes Safe7579's calldata-offset decoder reads on chain.
 */
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  hexToBigInt,
  parseAbiParameters,
  sliceHex,
  size,
  type Hex,
} from "viem";
import { EXEC_BATCH, EXEC_SINGLE, SAFE7579, SMART_SESSIONS, safe7579Abi } from "./session-keys-builders";

export { EXEC_BATCH, EXEC_SINGLE, SAFE7579, SMART_SESSIONS };

export type Execution = { target: Hex; value: bigint; data: Hex };

const EXECUTIONS_PARAMS = parseAbiParameters("(address target, uint256 value, bytes callData)[]");
const executeAbi = safe7579Abi.filter((f) => f.type === "function" && f.name === "execute");

function tryOr<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Decodes a Safe7579 root op. null unless the callData is exactly
 * `execute(EXEC_SINGLE | EXEC_BATCH, canonical payload)` with at least one execution.
 */
export function decodeSafe7579Execute(callData: Hex): { batch: boolean; executions: Execution[] } | null {
  const d = tryOr(() => decodeFunctionData({ abi: executeAbi, data: callData }));
  if (!d || d.functionName !== "execute") return null;
  const [mode, payload] = d.args as readonly [Hex, Hex];
  // Canonical outer encoding only (no trailing bytes, no odd offsets).
  const again = tryOr(() => encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [mode, payload] }));
  if (!again || again.toLowerCase() !== callData.toLowerCase()) return null;

  const m = mode.toLowerCase();
  if (m === EXEC_SINGLE.toLowerCase()) {
    if (size(payload) < 52) return null;
    const target = sliceHex(payload, 0, 20);
    const value = hexToBigInt(sliceHex(payload, 20, 52));
    const data = size(payload) === 52 ? ("0x" as Hex) : sliceHex(payload, 52);
    return { batch: false, executions: [{ target, value, data }] };
  }
  if (m === EXEC_BATCH.toLowerCase()) {
    const decoded = tryOr(() => decodeAbiParameters(EXECUTIONS_PARAMS, payload));
    if (!decoded) return null;
    const [list] = decoded;
    if (list.length === 0) return null;
    const canonical = tryOr(() => encodeAbiParameters(EXECUTIONS_PARAMS, [list]));
    if (!canonical || canonical.toLowerCase() !== payload.toLowerCase()) return null;
    return {
      batch: true,
      executions: list.map((e) => ({ target: e.target, value: e.value, data: e.callData })),
    };
  }
  return null;
}

/** EntryPoint v0.7 nonce key: the upper 192 bits of the nonce (0 = root / Safe owner). */
export function nonceKeyOf(nonce: bigint): bigint {
  return nonce >> 64n;
}
