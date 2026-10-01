import type { Stage } from "./constants";

export type TaskStatus = "offen" | "vergeben" | "in_arbeit" | "eingereicht" | "abgenommen" | "ausgezahlt" | "abgebrochen";
export type TaskAction = "apply" | "withdraw" | "assign" | "start" | "comment" | "proof" | "submit" | "approve" | "request_changes" | "cancel";

export interface TaskCtx {
  status: TaskStatus;
  actor: string;
  proposer: string;
  assignee: string | null;
  actorIsAttester: boolean;
  applicants: string[];
  firstApplicationAt: number | null;
  nowSec: number;
  hasProof: boolean;
  comment: string | null;
  target: string | null;
  proposalStage: Stage;
}
export type Decision = { ok: true; next: TaskStatus } | { ok: false; code: string; message: string };

export const PROPOSER_INACTIVE_SEC = 7 * 24 * 3600;
const FINAL: TaskStatus[] = ["abgenommen", "ausgezahlt", "abgebrochen"];

const allow = (next: TaskStatus): Decision => ({ ok: true, next });
const deny = (code: string, message: string): Decision => ({ ok: false, code, message });
const hasText = (s: string | null) => !!s && s.trim().length > 0;

export function decideTaskAction(action: TaskAction, c: TaskCtx): Decision {
  const isProposer = c.actor === c.proposer;
  const isAssignee = !!c.assignee && c.actor === c.assignee;

  switch (action) {
    case "apply":
      if (c.proposalStage === "abgelehnt") return deny("PROPOSAL_CLOSED", "Der Vorschlag wurde abgelehnt.");
      if (c.status !== "offen") return deny("BAD_STATUS", "Diese Aufgabe ist schon vergeben.");
      if (c.applicants.includes(c.actor)) return deny("ALREADY_APPLIED", "Du hast dich schon beworben.");
      return allow(c.status);

    case "withdraw":
      if (c.status !== "offen") return deny("BAD_STATUS", "Die Aufgabe ist schon vergeben.");
      if (!c.applicants.includes(c.actor)) return deny("NOT_AN_APPLICANT", "Du hast dich nicht beworben.");
      return allow(c.status);

    case "assign": {
      if (c.status !== "offen") return deny("BAD_STATUS", "Diese Aufgabe ist schon vergeben.");
      if (!c.target || !c.applicants.includes(c.target)) return deny("NOT_AN_APPLICANT", "Nur Bewerber:innen können ausgewählt werden.");
      const proposerApplied = c.applicants.includes(c.proposer);
      if (c.actor === c.target) return deny("SELF_ASSIGN", "Du kannst dir eine Aufgabe nicht selbst geben.");
      if (proposerApplied) {
        return c.actorIsAttester && !isProposer ? allow("vergeben")
          : deny("FORBIDDEN", "Da die Antragsteller:in sich beworben hat, wählt eine Attester:in aus.");
      }
      if (isProposer) return allow("vergeben");
      const inactive = c.firstApplicationAt !== null && c.nowSec - c.firstApplicationAt > PROPOSER_INACTIVE_SEC;
      return c.actorIsAttester && inactive ? allow("vergeben") : deny("FORBIDDEN", "Nur die Antragsteller:in kann die Aufgabe vergeben.");
    }

    case "start":
      if (c.status !== "vergeben") return deny("BAD_STATUS", "Die Aufgabe läuft schon.");
      return isAssignee ? allow("in_arbeit") : deny("FORBIDDEN", "Nur die zuständige Person kann starten.");

    case "proof":
      if (!isAssignee) return deny("FORBIDDEN", "Nur die zuständige Person kann Nachweise anhängen.");
      if (c.status === "vergeben") return allow("in_arbeit");
      if (c.status === "in_arbeit") return allow("in_arbeit");
      return deny("BAD_STATUS", "Für diese Aufgabe können keine Nachweise mehr angehängt werden.");

    case "comment":
      return hasText(c.comment) ? allow(c.status) : deny("COMMENT_REQUIRED", "Bitte schreibe einen Kommentar.");

    case "submit":
      if (c.status !== "in_arbeit") return deny("BAD_STATUS", "Die Aufgabe ist nicht in Arbeit.");
      if (!isAssignee) return deny("FORBIDDEN", "Nur die zuständige Person kann einreichen.");
      return c.hasProof ? allow("eingereicht") : deny("PROOF_REQUIRED", "Bitte hänge zuerst einen Nachweis an.");

    case "approve":
    case "request_changes":
      if (c.status !== "eingereicht") return deny("BAD_STATUS", "Die Aufgabe wartet nicht auf Abnahme.");
      if (!c.actorIsAttester) return deny("FORBIDDEN", "Nur Attester:innen nehmen Aufgaben ab.");
      if (isAssignee) return deny("SELF_APPROVE", "Du kannst deine eigene Aufgabe nicht abnehmen.");
      if (action === "request_changes" && !hasText(c.comment)) return deny("COMMENT_REQUIRED", "Bitte beschreibe, was fehlt.");
      return allow(action === "approve" ? "abgenommen" : "in_arbeit");

    case "cancel":
      if (FINAL.includes(c.status)) return deny("BAD_STATUS", "Diese Aufgabe ist schon abgeschlossen.");
      if (!isProposer && !c.actorIsAttester) return deny("FORBIDDEN", "Nur Antragsteller:in oder Attester:innen können abbrechen.");
      return hasText(c.comment) ? allow("abgebrochen") : deny("COMMENT_REQUIRED", "Bitte gib einen Grund an.");
  }
}
