// Approval-part helpers (pure): building the card, status transitions and
// applying an update to a stored message's parts.
import type { ApprovalPreview, ApprovalStatus, ChatPart } from "../types";
import type { Risk } from "./types";

export type ApprovalPart = Extract<ChatPart, { type: "approval" }>;
export type GatedRisk = "public" | "money" | "external";

const TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  pending: ["approved", "rejected", "expired", "executed", "failed"],
  approved: ["executed", "failed"],
  rejected: [],
  executed: [],
  failed: [],
  expired: [],
};

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function approvalTitle(risk: GatedRisk): string {
  switch (risk) {
    case "public": return "Freigabe: öffentliche Aktion";
    case "money": return "Freigabe: Röbel Münzen senden";
    case "external": return "Freigabe: externer Dienst";
  }
}

export function asGatedRisk(risk: Risk): GatedRisk | null {
  return risk === "public" || risk === "money" || risk === "external" ? risk : null;
}

export function buildApprovalPart(input: {
  actionId: string; tool: string; risk: GatedRisk; summary: string; preview?: ApprovalPreview | null;
  signRequest?: ApprovalPart["signRequest"];
}): ApprovalPart {
  const part: ApprovalPart = {
    type: "approval",
    actionId: input.actionId,
    tool: input.tool,
    risk: input.risk,
    title: approvalTitle(input.risk),
    summary: input.summary,
    preview: input.preview ?? { kind: "generic", fields: [], body: input.summary },
    status: "pending",
    canAlwaysAllow: input.risk !== "money",
  };
  if (input.risk === "money" && input.signRequest) part.signRequest = input.signRequest;
  return part;
}

/**
 * Sets the status (and optional result note) of the approval card for
 * `actionId`. Returns the new parts, or an error when the card is missing or
 * the transition is not allowed. A no-op transition to the same status is ok.
 */
export function applyApprovalUpdate(
  parts: ChatPart[], actionId: string, update: { status: ApprovalStatus; resultNote?: string },
): ChatPart[] | { error: string } {
  const idx = parts.findIndex((p) => p.type === "approval" && p.actionId === actionId);
  if (idx < 0) return { error: "Die Freigabe-Karte wurde nicht gefunden." };
  const card = parts[idx] as ApprovalPart;
  if (card.status !== update.status && !canTransition(card.status, update.status)) {
    return { error: "Diese Freigabe ist schon abgeschlossen." };
  }
  const next = parts.slice();
  const updated: ApprovalPart = { ...card, status: update.status };
  if (update.resultNote !== undefined) updated.resultNote = update.resultNote.slice(0, 500);
  next[idx] = updated;
  return next;
}

/** Model-facing one-liner for a stored approval card. */
export function describeApproval(p: ApprovalPart): string {
  const state: Record<ApprovalStatus, string> = {
    pending: "wartet auf Freigabe", approved: "freigegeben", rejected: "abgelehnt",
    executed: "ausgeführt", failed: "fehlgeschlagen", expired: "abgelaufen",
  };
  return `(Freigabe-Anfrage ${p.actionId}: ${p.summary} — ${state[p.status]}${p.resultNote ? ` — ${p.resultNote}` : ""})`;
}
