import type { Db } from "./settings";

export type VorhabenNotice = {
  wallet: string;
  kind: "vorhaben_tally" | "vorhaben_task" | "vorhaben_payout" | "vorhaben_safe";
  title: string;
  body: string;
  screen: "auszaehlung" | "aufgabe" | "vertrag" | "proposal";
  proposalKey: string;
  taskId?: string;
};

/** Inbox row + push (the notifications trigger forwards these types to send-notification). */
export async function notify(db: Db, notices: VorhabenNotice[]): Promise<void> {
  if (notices.length === 0) return;
  const rows = notices.map((n) => ({
    recipient_wallet: n.wallet.toLowerCase(),
    type: n.kind,
    title: n.title.slice(0, 80),
    body: n.body.slice(0, 200),
    metadata: { screen: n.screen, proposal_id: n.proposalKey, task_id: n.taskId ?? null },
  }));
  const { error } = await db.from("notifications").insert(rows);
  if (error) console.error("[vorhaben] notify failed", error.message);
}
