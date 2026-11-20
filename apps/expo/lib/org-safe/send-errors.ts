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
 *   paymaster / sponsor refusal, bundler refusal with Status 200 or 4xx, local configuration).
 * - reverted: mined and failed. Nothing changed on chain.
 * - unknown: anything else (receipt timeout, network failure, unparseable answer). Possibly sent.
 */
export type SendOutcome = 'rejected' | 'not_sent' | 'reverted' | 'unknown';

const NOT_SENT = [
  /eth_estimateUserOperationGas/,
  /thirdweb_getUserOperationGasPrice/,
  /zk_paymasterData/,
  /Paymaster error/,
  // passkey: "eth_sendUserOperation: …" is a JSON-RPC error on a 2xx answer (non-2xx throws "HTTP <n>" first).
  // The thirdweb form "eth_sendUserOperation error: …" is judged by its Status line in submissionStatus().
  /eth_sendUserOperation: /,
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

/**
 * thirdweb's sendBundlerRequest throws "eth_sendUserOperation error: <msg>\nStatus: <n>\nCode: …"
 * on any non-ok answer or JSON-RPC error. Only Status 200 (a JSON-RPC refusal) or 4xx is a
 * processed refusal; a 5xx (or no readable Status) may come after the bundler accepted the
 * operation, so it is possibly sent. Gas estimation / paymaster calls stay not_sent regardless
 * of status: nothing is submitted before eth_sendUserOperation.
 */
function submissionStatus(message: string): SendOutcome | null {
  if (!/eth_sendUserOperation error/.test(message)) return null;
  const status = /\nStatus: (\d{3})\b/.exec(message);
  if (!status) return 'unknown';
  const n = Number(status[1]);
  return n === 200 || (n >= 400 && n < 500) ? 'not_sent' : 'unknown';
}

export function classifySendError(err: unknown): SendOutcome {
  if (isUserRejection(err)) return 'rejected';
  const messages = chain(err).map((x) => x.message);
  if (messages.some((m) => REVERTED.some((r) => r.test(m)))) return 'reverted';
  // The submission call decides alone: an AA code inside a 5xx body does not make it not_sent.
  const submission = messages.map(submissionStatus).filter((x): x is SendOutcome => x !== null);
  if (submission.length) return submission.includes('unknown') ? 'unknown' : 'not_sent';
  if (messages.some((m) => NOT_SENT.some((r) => r.test(m)))) return 'not_sent';
  return 'unknown';
}
