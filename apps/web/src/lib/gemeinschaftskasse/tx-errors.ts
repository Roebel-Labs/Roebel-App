/**
 * Maps the raw errors thrown by the Safe / thirdweb / wallet stack to plain
 * German messages a non-technical treasurer can act on. Always returns a short
 * human `message`; the original text is kept as `detail` for an expandable
 * "Technische Details" disclosure.
 */
export interface FriendlyError {
  message: string;
  detail: string;
}

export function mapTxError(e: unknown): FriendlyError {
  const detail = e instanceof Error ? e.message : String(e);
  const t = detail.toLowerCase();

  const hit = (msg: string) => ({ message: msg, detail });

  // User cancelled in the wallet.
  if (t.includes("user rejected") || t.includes("user denied") || t.includes("abgelehnt") || t.includes("rejected the request"))
    return hit("Freigabe im Wallet abgebrochen.");

  // Not an owner of the Safe.
  if (t.includes("kein mitsignierer") || t.includes("not an owner") || t.includes("gs026") || t.includes("invalid owner"))
    return hit("Du bist kein Mitsignierer dieser Kasse.");

  // Not enough funds for the transfer / gas.
  if (t.includes("insufficient funds") || t.includes("insufficient balance") || t.includes("exceeds balance") || t.includes("transfer amount exceeds"))
    return hit("Nicht genug Guthaben in der Kasse für diese Auszahlung.");

  // Signature / threshold problems at execution.
  if (t.includes("gs020") || t.includes("signatures data too short"))
    return hit("Es fehlen noch Freigaben, um auszuführen.");
  if (t.includes("gs013") || t.includes("transaction reverted") || t.includes("execution reverted"))
    return hit("Die Ausführung wurde von der Blockchain abgelehnt. Bitte später erneut versuchen.");
  if (t.includes("is not valid") || t.includes("gs024") || t.includes("gs025"))
    return hit("Die Freigabe konnte nicht bestätigt werden. Bitte erneut freigeben.");

  // Already approved / nonce already used.
  if (t.includes("already approved") || t.includes("already executed") || t.includes("nonce"))
    return hit("Diese Transaktion wurde bereits bearbeitet. Bitte Seite neu laden.");

  // Network / RPC.
  if (t.includes("network") || t.includes("fetch failed") || t.includes("timeout") || t.includes("econn") || t.includes("rpc"))
    return hit("Netzwerkproblem. Bitte Internetverbindung prüfen und erneut versuchen.");

  // Not signed in.
  if (t.includes("bitte zuerst anmelden") || t.includes("no active account") || t.includes("not connected"))
    return hit("Bitte zuerst mit deinem Wallet anmelden.");

  // Fallback: keep it honest but calm.
  return hit("Etwas ist schiefgelaufen. Details unten — bitte erneut versuchen.");
}
