/**
 * Device-session (Safe7579 + SmartSession) sponsor modes, MINT ONLY (owner decisions 2026-11-21;
 * spec docs/superpowers/specs/2026-09-27-passkey-session-keys-design.md, "Sponsor-policy changes"
 * items 4-7; plan docs/superpowers/plans/2026-11-21-passkey-session-keys-mint.md, Task 9).
 *
 * `evaluateSessionKeyModes` runs inside evaluateSponsorPolicy right after the sender-proof and
 * factory checks and BEFORE every other mode. It claims an op (returns a PolicyResult, never
 * null) when ANY of these holds, and then that op is decided here and nowhere else:
 *  - the nonce key (nonce >> 64) is SESSION_NONCE_KEY (validated by SmartSession);
 *  - the request names `deviceSession`;
 *  - a root op (key 0) has a call whose target is the sender Safe itself or SmartSession.
 * Everything else returns null and goes through the ordinary modes (where any other non-zero
 * nonce key is denied).
 *
 * Modes (every one: no factory, a passkey proof (x, y) bound to the deployed sender by
 * checkDeployedPasskeySafe in the mode's layout, `legacy` named, a thirdweb Account proxy holding
 * CitizenNFT, isAdmin(legacy, sender), no mini app):
 *
 *  - session-upgrade (4337 layout, key 0, needs the kill switch ON): op.callData is BYTE-EQUAL to
 *    migrationCallData({ safe: sender, legacy, deviceSession, prev4337 from the chain's module
 *    list }). The sender's Safe modules must be exactly {Safe4337Module, SRM} (one page), so the
 *    migrated Safe has exactly {Safe7579, SRM} and stays sponsorable. This is the ONLY op with a
 *    DELEGATECALL into MultiSendCallOnly whose inner calls target the Safe itself.
 *  - session-grant (7579 layout, key 0, kill switch ON): BYTE-EQUAL to grantCallData({ …,
 *    replace: Safe7579.isModuleInstalled(1, SmartSession, "") }).
 *    Both: `deviceSession` with signer != 0 and now < validUntil <= now + DEVICE_SESSION_MAX_SEC;
 *    grant caps (callGasLimit 3.0M, verificationGasLimit 0.6M, maxFeePerGas 2 gwei);
 *    budget key `grant:<legacy>`.
 *  - session-revoke (7579 layout, key 0, ALLOWED WITH THE KILL SWITCH OFF: revoking only removes
 *    power; owner OK 2026-11-21): executions are only SmartSession.removeSession(pid) in canonical
 *    encoding, value 0, 1..n, no duplicates, each pid in SmartSession.getPermissionIDs(sender).
 *    Ordinary caps; budget key = legacy.
 *  - session (nonce key SESSION_NONCE_KEY, 7579 layout, kill switch ON, SmartSession installed):
 *    op.callData is BYTE-EQUAL to sessionClaimCallData(legacy, personalMint()) or to
 *    sessionClaimCallData(legacy, groupMint(Röbel group, [legacy], [amount], 0x)) with the amount
 *    read from the op (> 0) and the whole op compared with the canonical re-encoding.
 *    Session gas caps (SESSION_CAPS: fork-measured ~232k / ~234k total handleOps gas per op, caps
 *    with margin). The request MUST carry `deviceAuth`: the device session key's EIP-191 signature
 *    over deviceSessionAuthHash(100, hashStableFields(op), expiresAt), now < expiresAt <= now + 300 s;
 *    the recovered signer's permission id for the op's kind (personalMint / groupMint) must be one
 *    of SmartSession.getPermissionIDs(sender) ON CHAIN (permissionId = keccak256(OwnableValidator,
 *    abi.encode(1, [signer]), salt), so an enabled pid binds exactly that signer). Without it: denied
 *    before any reservation (security review M-1).
 *    Budget key `session:<sender>` with its own per-key cap PASSKEY_SPONSOR_SESSION_DAILY_WEI (the
 *    handler applies it) and a settle-able reservation per (sender, nonce) that is settled to the
 *    EntryPoint's actualGasCost after landing (sponsor-settle.ts; security review M-2). Session ops
 *    never touch the legacy's everyday budget, so hourly claims cannot starve votes or sends.
 *
 * Kill switch: ctx.sessionKeysEnabled must be exactly `true` for upgrade / grant / session;
 * unset, false or a failed read deny them ("device sessions are switched off") before any chain
 * read. Structural checks (shape, bounds, gas) never touch the chain; chain read failures throw
 * ChainReadError (the caller fails closed).
 */
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddress,
  isAddressEqual,
  parseAbi,
  recoverMessageAddress,
  size,
  zeroAddress,
  type Hex,
} from "viem";
import {
  CAPS,
  checkDeployedPasskeySafe,
  checkGas,
  decodeMultiSendPacked,
  isCitizen,
  isLegacyProxyCode,
  read,
  senderProof,
  type ChainReader,
  type GasCaps,
  type PolicyResult,
  type SafeLayout,
  type SponsorContext,
  type SponsorUserOp,
  toPackedUserOperation,
} from "./sponsor-policy";
import { hashStableFields } from "./voucher";
import { decodeSafe7579Execute, nonceKeyOf } from "./safe7579";
import { PASSKEY_SAFE } from "./safe-address";
import {
  CIRCLES_HUB,
  DEVICE_AUTH_MAX_TTL_SEC,
  DEVICE_SESSION_MAX_SEC,
  MULTI_SEND_CALL_ONLY,
  SESSION_NONCE_KEY,
  SMART_SESSIONS,
  circlesHubMintAbi,
  grantCallData,
  groupMintData,
  legacyAccountAbi,
  migrationCallData,
  permissionIdsOf,
  personalMintData,
  prev4337AfterEnable,
  sessionClaimCallData,
  smartSessionAbi,
  deviceSessionAuthHash,
  type MintSessionKind,
} from "./session-keys-builders";

/**
 * Gas caps of the device-session modes (grant / upgrade: the rest of the op stays under CAPS).
 * Session (mint) ops get their own tight table: the fork measured ~232k (personalMint) and ~234k
 * (groupMint) total handleOps gas, so the sum of the caps (300k + 500k + 100k + 200k + 60k =
 * 1.16M gas, x 2 gwei = 0.00232 xDAI max prefund) leaves ~5x margin for bundler padding while a
 * single voucher can never reserve more than 0.00232 xDAI.
 */
export const SESSION_CAPS = {
  grantCallGasLimit: 3_000_000n,
  grantVerificationGasLimit: 600_000n,
  grantMaxFeePerGas: 2_000_000_000n,
  sessionCallGasLimit: 300_000n,
  sessionVerificationGasLimit: 500_000n,
  sessionPreVerificationGas: 100_000n,
  sessionMaxFeePerGas: 2_000_000_000n,
  sessionPaymasterVerificationGasLimit: 200_000n,
  sessionPaymasterPostOpGasLimit: 60_000n,
} as const;

/**
 * 0.05 xDAI per device session (budget key `session:<sender>`) per UTC day; env
 * PASSKEY_SPONSOR_SESSION_DAILY_WEI. Fits 24 hourly claims (48 ops) settled to their actual cost
 * (48 x ~320k gas x 2 gwei = 0.0307 xDAI) plus ~8 open max-prefund reservations (8 x 0.00232).
 */
export const DEFAULT_SESSION_DAILY_WEI = 5n * 10n ** 16n;

/** Budget key of one Safe's device-session ops (own per-key cap, never the legacy's budget). */
export const sessionGroupKey = (sender: Hex) => `session:${sender.toLowerCase() as Hex}` as const;

const SAFE_MODULES_SENTINEL: Hex = "0x0000000000000000000000000000000000000001";

const safe4337Abi = parseAbi([
  "function executeUserOp(address to, uint256 value, bytes data, uint8 operation)",
  "function executeUserOpWithErrorString(address to, uint256 value, bytes data, uint8 operation)",
]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);

type Fail = { ok: false; reason: string };
const deny = (reason: string): Fail => ({ ok: false, reason });

function tryOr<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

const sameBytes = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

// Functions, not module constants: sponsor-policy.ts and this module import each other, so CAPS
// may not be initialised yet while this module's top level runs.
const grantCaps = (): GasCaps => ({
  ...CAPS,
  callGasLimit: SESSION_CAPS.grantCallGasLimit,
  verificationGasLimit: SESSION_CAPS.grantVerificationGasLimit,
  maxFeePerGas: SESSION_CAPS.grantMaxFeePerGas,
});
const sessionOpCaps = (): GasCaps => ({
  callGasLimit: SESSION_CAPS.sessionCallGasLimit,
  verificationGasLimit: SESSION_CAPS.sessionVerificationGasLimit,
  preVerificationGas: SESSION_CAPS.sessionPreVerificationGas,
  maxFeePerGas: SESSION_CAPS.sessionMaxFeePerGas,
  paymasterVerificationGasLimit: SESSION_CAPS.sessionPaymasterVerificationGasLimit,
  paymasterPostOpGasLimit: SESSION_CAPS.sessionPaymasterPostOpGasLimit,
});

/**
 * Targets of the op's calls, whichever layout (best effort, structural): Safe7579.execute
 * executions; Safe4337Module.executeUserOp's target, or the inner txs of a DELEGATECALL into
 * MultiSendCallOnly. null when the callData is neither (the ordinary modes deny it).
 */
function callTargets(callData: Hex): { layout: SafeLayout; targets: Hex[] } | null {
  const exec = decodeSafe7579Execute(callData);
  if (exec) return { layout: "7579", targets: exec.executions.map((e) => e.target) };
  const outer = tryOr(() => decodeFunctionData({ abi: safe4337Abi, data: callData }));
  if (!outer) return null;
  const [to, , data, operation] = outer.args;
  const targets: Hex[] = [to];
  if (operation === 1 && isAddressEqual(to, MULTI_SEND_CALL_ONLY)) {
    const ms = tryOr(() => decodeFunctionData({ abi: multiSendAbi, data }));
    const txs = ms ? decodeMultiSendPacked(ms.args[0]) : null;
    for (const tx of txs ?? []) targets.push(tx.to);
  }
  return { layout: "4337", targets };
}

/** `deviceSession` bounds: signer a non-zero address, now < validUntil <= now + DEVICE_SESSION_MAX_SEC. */
function checkDeviceSession(ctx: SponsorContext): Fail | { ok: true; signer: Hex; validUntil: number } {
  const ds = ctx.deviceSession;
  if (!ds) return deny("a device-session grant needs deviceSession { signer, validUntil }");
  if (typeof ds.signer !== "string" || !isAddress(ds.signer, { strict: false }) || isAddressEqual(ds.signer, zeroAddress)) {
    return deny("deviceSession.signer must be a non-zero address");
  }
  const v = ds.validUntil;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) return deny("deviceSession.validUntil must be an integer");
  if (v <= ctx.nowSeconds) return deny("deviceSession.validUntil is not in the future");
  if (v > ctx.nowSeconds + DEVICE_SESSION_MAX_SEC) return deny("deviceSession.validUntil is beyond 30 days");
  return { ok: true, signer: ds.signer, validUntil: v };
}

/** Kill switch: only an explicit `true` opens the minting modes. */
const switchedOn = (ctx: SponsorContext) => ctx.sessionKeysEnabled === true;
const SWITCHED_OFF = "device sessions are switched off";

/**
 * The identity half every device-session mode shares: the deployed passkey Safe for (x, y) in
 * `layout`, a citizen thirdweb `legacy` that the sender administers.
 */
async function checkIdentity(
  op: SponsorUserOp,
  ctx: SponsorContext,
  key: { x: Hex; y: Hex },
  legacy: Hex,
  layout: SafeLayout,
  chain: ChainReader,
): Promise<Fail | { ok: true }> {
  const sender = await checkDeployedPasskeySafe(op.sender, key, layout, chain);
  if (!sender.ok) return sender;
  const [legacyCode, citizen, admin] = await Promise.all([
    read(() => chain.getCode(legacy)),
    isCitizen(legacy, ctx.v3 ?? {}, chain),
    read(() => chain.isAdmin(legacy, op.sender)),
  ]);
  if (!isLegacyProxyCode(legacyCode)) return deny(`${legacy} is not a legacy thirdweb account`);
  if (!citizen) return deny("legacy account holds no CitizenNFT");
  if (admin !== true) return deny(`sender is not an admin of ${legacy}`);
  return { ok: true };
}

const grantKey = (legacy: Hex) => `grant:${legacy.toLowerCase() as Hex}` as const;

/** session-upgrade: the byte-equal migration batch (Safe4337Module path, one passkey prompt). */
async function evaluateUpgrade(op: SponsorUserOp, ctx: SponsorContext, key: { x: Hex; y: Hex }, legacy: Hex, chain: ChainReader): Promise<PolicyResult> {
  if (!switchedOn(ctx)) return deny(SWITCHED_OFF);
  const gas = checkGas(op, grantCaps());
  if (!gas.ok) return gas;
  const ds = checkDeviceSession(ctx);
  if (!ds.ok) return ds;

  const id = await checkIdentity(op, ctx, key, legacy, "4337", chain);
  if (!id.ok) return id;
  const page = await read(() => chain.getModulesPaginated(op.sender));
  const expectedModules = [PASSKEY_SAFE.safe4337Module, PASSKEY_SAFE.socialRecoveryModule];
  const exact =
    isAddressEqual(page.next, SAFE_MODULES_SENTINEL) &&
    page.modules.length === expectedModules.length &&
    expectedModules.every((m) => page.modules.filter((x) => isAddressEqual(x, m)).length === 1);
  if (!exact) return deny("a session upgrade needs exactly the modules Safe4337Module and SocialRecoveryModule");
  const expected = tryOr(() =>
    migrationCallData({
      safe: op.sender,
      legacy,
      signer: ds.signer,
      validUntil: ds.validUntil,
      prev4337: prev4337AfterEnable(page.modules),
    }),
  );
  if (!expected || !sameBytes(op.callData, expected)) {
    return deny("session upgrade callData is not the migration batch for this Safe and deviceSession");
  }
  return { ok: true, mode: "session-upgrade", budgetKey: grantKey(legacy) };
}

/** session-grant: (re)install SmartSession with this device's two mint sessions (7579 root op). */
async function evaluateGrant(op: SponsorUserOp, ctx: SponsorContext, key: { x: Hex; y: Hex }, legacy: Hex, chain: ChainReader): Promise<PolicyResult> {
  if (!switchedOn(ctx)) return deny(SWITCHED_OFF);
  const gas = checkGas(op, grantCaps());
  if (!gas.ok) return gas;
  const ds = checkDeviceSession(ctx);
  if (!ds.ok) return ds;

  const id = await checkIdentity(op, ctx, key, legacy, "7579", chain);
  if (!id.ok) return id;
  const installed = await read(() => chain.isSmartSessionInstalled(op.sender));
  const expected = tryOr(() =>
    grantCallData({ safe: op.sender, legacy, signer: ds.signer, validUntil: ds.validUntil, replace: installed === true }),
  );
  if (!expected || !sameBytes(op.callData, expected)) {
    return deny("session grant callData is not the grant for this Safe and deviceSession");
  }
  return { ok: true, mode: "session-grant", budgetKey: grantKey(legacy) };
}

/** session-revoke: SmartSession.removeSession(pid) of the Safe's own on-chain pids only. Kill switch does not apply. */
async function evaluateRevoke(op: SponsorUserOp, ctx: SponsorContext, key: { x: Hex; y: Hex }, legacy: Hex, chain: ChainReader): Promise<PolicyResult> {
  const gas = checkGas(op);
  if (!gas.ok) return gas;
  const exec = decodeSafe7579Execute(op.callData);
  if (!exec) return deny("a session revoke must be a Safe7579 root op");
  const pids: Hex[] = [];
  for (const e of exec.executions) {
    if (!isAddressEqual(e.target, SMART_SESSIONS)) return deny("a session revoke may only call SmartSession.removeSession");
    if (e.value !== 0n) return deny("a session revoke execution must have value 0");
    const d = tryOr(() => decodeFunctionData({ abi: smartSessionAbi, data: e.data }));
    if (!d || d.functionName !== "removeSession") return deny("a session revoke may only call SmartSession.removeSession");
    const pid = d.args[0];
    const canonical = encodeFunctionData({ abi: smartSessionAbi, functionName: "removeSession", args: [pid] });
    if (!sameBytes(canonical, e.data)) return deny("removeSession calldata is not canonical");
    if (pids.some((p) => sameBytes(p, pid))) return deny("a session revoke names a permission id twice");
    pids.push(pid);
  }
  if (pids.length === 0) return deny("a session revoke needs at least one removeSession");

  const id = await checkIdentity(op, ctx, key, legacy, "7579", chain);
  if (!id.ok) return id;
  const onChain = await read(() => chain.getPermissionIDs(op.sender));
  for (const pid of pids) {
    if (!onChain.some((p) => sameBytes(p, pid))) return deny("removeSession names a permission id the Safe does not have");
  }
  return { ok: true, mode: "session-revoke", budgetKey: legacy };
}

/** The claim inside a session op: personalMint, or groupMint into the Röbel group with [legacy] collateral. */
function expectedSessionCallData(callData: Hex, legacy: Hex): { expected: Hex; kind: MintSessionKind } | null {
  const exec = decodeSafe7579Execute(callData);
  if (!exec || exec.batch || exec.executions.length !== 1) return null;
  const [e] = exec.executions;
  if (!isAddressEqual(e.target, legacy) || e.value !== 0n) return null;
  const outer = tryOr(() => decodeFunctionData({ abi: legacyAccountAbi, data: e.data }));
  if (!outer || outer.functionName !== "execute") return null;
  const [target, value, inner] = outer.args;
  if (!isAddressEqual(target, CIRCLES_HUB) || value !== 0n || size(inner) < 4) return null;
  const hub = tryOr(() => decodeFunctionData({ abi: circlesHubMintAbi, data: inner }));
  if (!hub) return null;
  if (hub.functionName === "personalMint") {
    const expected = tryOr(() => sessionClaimCallData(legacy, personalMintData()));
    return expected ? { expected, kind: "personalMint" } : null;
  }
  const [, , amounts] = hub.args;
  if (amounts.length !== 1 || amounts[0] <= 0n) return null;
  const expected = tryOr(() => sessionClaimCallData(legacy, groupMintData(legacy, amounts[0])));
  return expected ? { expected, kind: "groupMint" } : null;
}

/**
 * The device key that authorized this sponsor request (M-1): recovered from the EIP-191 signature
 * over deviceSessionAuthHash. Pure crypto, no chain read; the on-chain binding is checked by the caller.
 */
async function recoverDeviceAuthSigner(op: SponsorUserOp, ctx: SponsorContext): Promise<Fail | { ok: true; signer: Hex }> {
  const auth = ctx.deviceAuth;
  if (!auth) return deny("a session op needs deviceAuth (the device session key's signature)");
  if (!Number.isSafeInteger(auth.expiresAt) || auth.expiresAt <= ctx.nowSeconds) return deny("deviceAuth has expired");
  if (auth.expiresAt > ctx.nowSeconds + DEVICE_AUTH_MAX_TTL_SEC) return deny("deviceAuth.expiresAt is too far in the future");
  const hash = deviceSessionAuthHash({ chainId: 100, stableFieldsHash: hashStableFields(toPackedUserOperation(op)), expiresAt: auth.expiresAt });
  let signer: Hex;
  try {
    signer = await recoverMessageAddress({ message: { raw: hash }, signature: auth.signature });
  } catch {
    return deny("deviceAuth signature is invalid");
  }
  return { ok: true, signer };
}

/** session: a device-key op (SmartSession nonce key) that mints for the sender's own legacy. */
async function evaluateSessionOp(op: SponsorUserOp, ctx: SponsorContext, key: { x: Hex; y: Hex }, legacy: Hex, chain: ChainReader): Promise<PolicyResult> {
  if (!switchedOn(ctx)) return deny(SWITCHED_OFF);
  if (ctx.deviceSession) return deny("a session op does not name deviceSession");
  const gas = checkGas(op, sessionOpCaps());
  if (!gas.ok) return gas;
  const claim = expectedSessionCallData(op.callData, legacy);
  if (!claim || !sameBytes(op.callData, claim.expected)) {
    return deny("a session op may only be personalMint or the Röbel groupMint for the request's legacy, one call, canonical");
  }
  const device = await recoverDeviceAuthSigner(op, ctx);
  if (!device.ok) return device;

  const id = await checkIdentity(op, ctx, key, legacy, "7579", chain);
  if (!id.ok) return id;
  const installed = await read(() => chain.isSmartSessionInstalled(op.sender));
  if (installed !== true) return deny("SmartSession is not installed on the sender");
  // The signer is bound on chain: the pid commits to OwnableValidator config [signer] + the kind's salt.
  const pid = permissionIdsOf({ legacy, signer: device.signer, validUntil: 0 })[claim.kind];
  const enabled = await read(() => chain.getPermissionIDs(op.sender));
  if (!enabled.some((p) => sameBytes(p, pid))) {
    return deny("deviceAuth signer holds no enabled session of this kind on the sender");
  }
  return { ok: true, mode: "session", budgetKey: sessionGroupKey(op.sender) };
}

/**
 * The device-session modes, or null when the op is not a device-session shape (see the header).
 * Throws ChainReadError on a failed chain read.
 */
export async function evaluateSessionKeyModes(
  op: SponsorUserOp,
  ctx: SponsorContext,
  chain: ChainReader,
): Promise<PolicyResult | null> {
  const nonceKey = nonceKeyOf(op.nonce);
  const sessionKey = nonceKey === SESSION_NONCE_KEY;
  const shape = callTargets(op.callData);
  let claim = sessionKey || ctx.deviceSession !== undefined;
  if (!claim && nonceKey === 0n && shape) {
    claim = shape.targets.some((t) => isAddressEqual(t, op.sender) || isAddressEqual(t, SMART_SESSIONS));
  }
  if (!claim) {
    // deviceAuth only ever authorizes a session op.
    return ctx.deviceAuth ? deny("deviceAuth is only for session ops (SmartSession nonce key)") : null;
  }
  if (ctx.deviceAuth && !sessionKey) return deny("deviceAuth is only for session ops (SmartSession nonce key)");
  if (!sessionKey && nonceKey !== 0n) return deny("nonce key not allowed (only key 0 or the SmartSession key)");

  // ---- structural, zero chain reads ----
  const proof = senderProof(ctx);
  if (!proof || proof.kind !== "passkey") return deny("device sessions are only for passkey Safes");
  if (op.factory || (op.factoryData !== undefined && size(op.factoryData) > 0)) {
    return deny("a device-session op needs an already deployed Safe");
  }
  if (ctx.miniApp) return deny("a device-session op cannot be a mini-app request");
  const legacy = ctx.legacy;
  if (!legacy) return deny("a device-session op must name its legacy account");
  const key = { x: proof.x, y: proof.y };

  if (sessionKey) return evaluateSessionOp(op, ctx, key, legacy, chain);
  if (!shape) return deny("callData is not a device-session shape");
  if (ctx.deviceSession) {
    return shape.layout === "4337"
      ? evaluateUpgrade(op, ctx, key, legacy, chain)
      : evaluateGrant(op, ctx, key, legacy, chain);
  }
  if (shape.layout === "7579" && shape.targets.every((t) => isAddressEqual(t, SMART_SESSIONS))) {
    return evaluateRevoke(op, ctx, key, legacy, chain);
  }
  return deny("a call to the Safe itself or SmartSession is only sponsored as a device-session upgrade, grant or revoke");
}
