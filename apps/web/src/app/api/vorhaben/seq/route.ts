import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { parseObjectAddress } from "@/lib/vorhaben/person-events";

export const dynamic = "force-dynamic";

// GET ?object=<32108 task | 32104 poll address> → { next }: the seq a person-signed action on it must carry.
export async function GET(req: NextRequest) {
  const town = (process.env.VORHABEN_TOWN_PUBKEY ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(town)) {
    return jsonFail(503, "FEATURE_OFF", "Signierte Nostr-Aktionen sind auf diesem Server nicht eingerichtet (VORHABEN_TOWN_PUBKEY fehlt).");
  }
  const address = req.nextUrl.searchParams.get("object") ?? "";
  const parsed = parseObjectAddress(address, town);
  if (!parsed) return jsonFail(400, "BAD_REQUEST", "object ist keine Aufgaben- oder Abstimmungsadresse dieses Ortes.");
  try {
    const db = createAdminClient();
    let objectType: "task" | "tally" = "task";
    let objectId: string;
    if (parsed.type === "task") {
      objectId = parsed.taskId;
    } else {
      const p = await db.from("proposals").select("id").eq("proposal_id", parsed.proposalKey).maybeSingle();
      if (p.error) throw new Error(`proposal: ${p.error.message}`);
      if (!p.data) return jsonFail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");
      objectType = "tally";
      objectId = (p.data as { id: string }).id;
    }
    const r = await db.rpc("next_outbox_seq", { p_object_type: objectType, p_object_id: objectId });
    if (r.error) throw new Error(`next_outbox_seq: ${r.error.message}`);
    return jsonOk({ next: r.data as number });
  } catch (e) {
    console.error("[vorhaben/seq]", e);
    return jsonFail(500, "INTERNAL", "Sequenz konnte nicht geladen werden.");
  }
}
