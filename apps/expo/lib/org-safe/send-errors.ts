/**
 * What a failed sponsored send means for "may the app send again?". Shared by every sender of
 * register operations (org confirmations, Guest claims).
 *
 * Both send paths wait for the userOp receipt INSIDE the send call (thirdweb smart account:
 * _sendUserOp → bundleUserOp → waitForUserOpReceipt, 120 s timeout; passkey Safe:
 * sendPasskeyUserOp → eth_sendUserOperation → receipt poll, 120 s). A timeout or a network error
 * there comes with no transaction hash although the operation may be on its way, so anything not
 * clearly refused before submission is "unknown" and must not be sent again.
 *
 * - rejected: the person declined in the wallet / passkey prompt. Nothing was sent.
 * - not_sent: refused before eth_sendUserOperation was accepted (gas estimate, simulation,
 *   paymaster / sponsor refusal, bundler answered with an error, local configuration).
 * - reverted: mined and failed. Nothing changed on chain.
 * - unknown: anything else (receipt timeout, network failure, unparseable answer). Possibly sent.
 */
export type SendOutcome = 'rejected' | 'not_sent' | 'reverted' | 'unknown';

const NOT_SENT = [
  /eth_estimateUserOperationGas/,
  /thirdweb_getUserOperationGasPrice/,
  /zk_paymasterData/,
  /Paymaster error/,
  // thirdweb: "eth_sendUserOperation error: …"; passkey: "eth_sendUserOperation: …" — the bundler answered with a refusal.
  /eth_sendUserOperation(:| error)/,
  /\bAA[1-5]\d\b/,
  /exceeds the sponsor caps/,
  /is not configured/,
  /only the passkey Safe/,
  // An HTTP 4xx answer is a processed refusal; 5xx / no answer stays unknown.
  /^HTTP 4\d\d\b/,
];

const REVERTED = [/UserOp failed/, /userOp reverted/];

function chain(err: unknown): { code?: unknown; name?: unknown; message: string }[] {
  const out: { code?: unknown; name?: unknown; message: string }[] = [];
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e; depth++) {
    if (typeof e === 'object') {
      const x = e as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
      out.push({ code: x.code, name: x.name, message: typeof x.message === 'string' ? x.message : '' });
      e = x.cause;
    } else {
      out.push({ message: String(e) });
      break;
    }
  }
  return out;
}

/** The wallet's own "user rejected" (EIP-1193 4001, viem UserRejectedRequestError, WebAuthn NotAllowedError). */
export function isUserRejection(err: unknown): boolean {
  return chain(err).some(
    (x) =>
      x.code === 4001 ||
      x.name === 'UserRejectedRequestError' ||
      x.name === 'NotAllowedError' ||
      /\buser (rejected|denied)\b/i.test(x.message),
  );
}

export function classifySendError(err: unknown): SendOutcome {
  if (isUserRejection(err)) return 'rejected';
  const messages = chain(err).map((x) => x.message);
  if (messages.some((m) => REVERTED.some((r) => r.test(m)))) return 'reverted';
  if (messages.some((m) => NOT_SENT.some((r) => r.test(m)))) return 'not_sent';
  return 'unknown';
}
