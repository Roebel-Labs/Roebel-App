// What the event badge panel shows (dashboard tab "Abzeichen", and the same labels in the app):
// the primary button and the count line, from an event_badge_get result. Pure.
// Relative imports only: loaded by `npx tsx --test`.

/** event_badge_get answer (server: EventBadgeGetResult in event-badges.ts). */
export type EventBadgeGetResult = {
  attendees: number;
  notYetIssued: number;
  issued: number;
  accepted: number;
  badge: { typeId: string; name: string; imageUrl: string | null; supplyCap: number; chain: "draft" | "onchain"; auto: boolean } | null;
};

export type EventPanelState = { primary: { label: string; enabled: boolean }; lines: string[] };

export const PANEL_LABELS = {
  setup: "Abzeichen für Teilnehmende einrichten",
  issue: (n: number) => `Abzeichen vergeben (${n})`,
  allIssued: "Alle haben ihr Abzeichen",
  /** A draft badge before anyone attended: the badge goes into the register alone. */
  register: "Abzeichen jetzt anlegen",
  noAttendees: "Noch keine Teilnehmenden",
} as const;

export function countLine(g: Pick<EventBadgeGetResult, "attendees" | "issued" | "accepted">): string {
  return `${g.attendees} Teilnehmende · ${g.issued} eingeladen · ${g.accepted} angenommen`;
}

export function eventPanelState(g: EventBadgeGetResult, _now: number): EventPanelState {
  void _now;
  const lines = [countLine(g)];
  if (!g.badge) return { primary: { label: PANEL_LABELS.setup, enabled: true }, lines };
  if (g.notYetIssued > 0) return { primary: { label: PANEL_LABELS.issue(g.notYetIssued), enabled: true }, lines };
  if (g.badge.chain === "draft") return { primary: { label: PANEL_LABELS.register, enabled: true }, lines };
  if (g.attendees === 0) return { primary: { label: PANEL_LABELS.noAttendees, enabled: false }, lines };
  return { primary: { label: PANEL_LABELS.allIssued, enabled: false }, lines };
}
