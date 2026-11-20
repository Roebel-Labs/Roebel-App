/**
 * Server side of "Server fragen": who is calling, verified. The Röbel app hands the mini app a
 * short-lived user token (`sdk.auth.getToken()`); the front end sends it as
 * `Authorization: Bearer <token>` and this checks it. `context.user` from the SDK is display-only
 * and must never be trusted here.
 */
export type VerifiedUser = { id: string; has(type: string): boolean };

export type WhoAmIResult =
  | { status: 200; body: { id: string; citizen: boolean } }
  | { status: 401; body: { error: string } };

export async function whoAmI(
  authorization: string | null,
  verify: (token: string) => Promise<VerifiedUser>,
): Promise<WhoAmIResult> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return { status: 401, body: { error: "Kein Token." } };
  try {
    const user = await verify(token);
    return { status: 200, body: { id: user.id, citizen: user.has("citizen") } };
  } catch {
    return { status: 401, body: { error: "Token ungültig oder abgelaufen." } };
  }
}
