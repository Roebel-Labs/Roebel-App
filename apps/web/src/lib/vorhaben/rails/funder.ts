/** Calls the vorhaben-payout-send edge function (the funder key lives only in Supabase). */
export async function sendViaFunder(lineId: string): Promise<{ status: string; txHash?: string; reason?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: "failed", reason: "supabase not configured" };
  try {
    const res = await fetch(`${url}/functions/v1/vorhaben-payout-send`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ lineId }),
      signal: AbortSignal.timeout(60_000),
    });
    return (await res.json()) as { status: string; txHash?: string; reason?: string };
  } catch (e) {
    // A timeout here may still have sent: the line is sendend/gesendet in the DB and reconcile handles it.
    return { status: "unknown", reason: e instanceof Error ? e.message : String(e) };
  }
}
