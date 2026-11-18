// Pure view models for the dashboard's batches and settings pages. Runs in the browser.
// Never outputs a wallet address: people and keys are shown by display name or label.
// Relative imports only: loaded by `npx tsx --test`.
import type { ActionView, BatchView } from "./actions";

export type BatchState = "Wartet auf Bestätigung" | "Eingetragen" | "Widerrufen" | "Verworfen" | "Abgelaufen" | "Fehlgeschlagen";

export type BatchRowView = {
  id: string;
  title: string;
  /** ISO time the batch was prepared (the action's, else the batch's own). */
  when: string;
  state: BatchState;
  counts: { invited: number; accepted: number; revoked: number };
  /** Letters (PDF) can be downloaded: the batch is on chain and has open claim-key invitations. */
  letters: boolean;
};

function stateOf(b: BatchView, a: ActionView | undefined): BatchState {
  if (b.status === "revoked") return "Widerrufen";
  if (b.status === "onchain") return "Eingetragen";
  switch (a?.status) {
    case "awaiting_confirmation":
    case "submitted":
      return "Wartet auf Bestätigung";
    case "done":
      return "Eingetragen";
    case "expired":
      return "Abgelaufen";
    case "failed":
      return "Fehlgeschlagen";
    case "cancelled":
      return "Verworfen";
    default:
      return b.status === "cancelled" ? "Verworfen" : "Wartet auf Bestätigung";
  }
}

/** One row per batch, newest first. */
export function batchRows(actions: ActionView[], batches: BatchView[]): BatchRowView[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  return batches
    .map((b): BatchRowView => {
      const a = b.actionId ? byId.get(b.actionId) : undefined;
      return {
        id: b.id,
        title: a?.summary.title ?? `${b.count} ausgestellt`,
        when: a?.createdAt ?? b.createdAt,
        state: stateOf(b, a),
        counts: { invited: b.invited, accepted: b.accepted, revoked: b.revoked },
        letters: b.status === "onchain" && b.hasOpenLinks,
      };
    })
    .sort((x, y) => y.when.localeCompare(x.when));
}

const ADDRESS_LIKE = /0x[0-9a-f]{6}/i;
const shown = (v: string | null | undefined) => (v && v.trim() && !ADDRESS_LIKE.test(v) ? v.trim() : null);

/** Delegates by display name, else label, else "Unbekanntes Konto" — never the address. */
export function delegateRows(rows: { delegate: string; label: string | null; displayName: string | null; typeName: string }[]): { who: string; typeName: string }[] {
  return rows.map((r) => ({ who: shown(r.displayName) ?? shown(r.label) ?? "Unbekanntes Konto", typeName: shown(r.typeName) ?? "Ausweis" }));
}
