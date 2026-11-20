export type MiniAppVerifyErrorCode =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "wrong_audience"
  | "wrong_issuer"
  | "wrong_domain"
  | "wrong_chain"
  | "wrong_nonce"
  | "unsupported";

/** Every refusal of this package; `code` says why. */
export class MiniAppVerifyError extends Error {
  readonly code: MiniAppVerifyErrorCode;
  constructor(code: MiniAppVerifyErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MiniAppVerifyError";
    this.code = code;
  }
}
