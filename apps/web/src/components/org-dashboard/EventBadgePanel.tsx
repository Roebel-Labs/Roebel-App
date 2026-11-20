"use client";

import { useCallback, useEffect, useState } from "react";
import { Award } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { OrgGateCard, type OrgGateState } from "@/components/credentials/OrgGateCard";
import { CredentialsContext, useCredentials, type CredentialOrg } from "@/components/credentials/CredentialsContext";
import { PendingActionPanel, freshAction } from "@/components/credentials/PendingActionPanel";
import { credentialsRequest, type ActionView } from "@/lib/credentials/client";
import { eventPanelState, type EventBadgeGetResult } from "@/lib/credentials/event-panel";

const AUTO_HELP = "Dafür darf der Röbel-Server dieses Abzeichen in eurem Namen ausstellen, sonst nichts. Ihr könnt das jederzeit beenden.";

/**
 * Event tab "Abzeichen": attendees (door check-ins and QR scans) get a badge with one tap.
 * Brings its own org gate (the event pages sit outside the credentials layout) and provides the
 * credentials context for the pending-action panel.
 */
export function EventBadgePanel({ eventId, accountId, eventTitle, eventImageUrl }: { eventId: string; accountId: string; eventTitle: string; eventImageUrl: string | null }) {
  const signer = useActiveAccount();
  const [gate, setGate] = useState<OrgGateState | "loading">("loading");
  const [org, setOrg] = useState<CredentialOrg | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    if (!signer) return setGate("signed_out");
    const status = await fetch("/api/credentials/status")
      .then((r) => r.json())
      .catch(() => null);
    if (!(status?.enabled === true && status?.configured === true)) return setGate("not_enabled");
    const r = await credentialsRequest<CredentialOrg[]>(signer, "org", "orgs_list", {});
    if (!r.ok) return setError(r.message);
    const o = r.data.find((x) => x.accountId === accountId) ?? null;
    setOrg(o);
    setGate(!o ? "forbidden" : o.onChain);
  }, [signer, accountId]);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  if (error) return <div className="rounded-lg border border-[#B4B8C1] bg-card p-4 text-sm text-red-600">{error}</div>;
  if (gate === "loading") return <div className="h-32 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" aria-busy />;
  if (gate !== "ready" || !org || !signer) return <OrgGateCard state={gate === "ready" ? "forbidden" : gate} />;
  return (
    <CredentialsContext.Provider value={{ account: signer, org, refreshOrg: loadOrg }}>
      <EventBadgeInner eventId={eventId} eventTitle={eventTitle} eventImageUrl={eventImageUrl} />
    </CredentialsContext.Provider>
  );
}

function EventBadgeInner({ eventId, eventTitle, eventImageUrl }: { eventId: string; eventTitle: string; eventImageUrl: string | null }) {
  const { account } = useCredentials();
  const [g, setG] = useState<EventBadgeGetResult | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionView | null>(null);

  const load = useCallback(async () => {
    const r = await credentialsRequest<EventBadgeGetResult>(account, "org", "event_badge_get", { eventId });
    if (!r.ok) return setError(r.message);
    setG(r.data);
    setName((n) => n || r.data.badge?.name || `Dabei: ${eventTitle}`.slice(0, 60));
    setImageUrl((u) => u || r.data.badge?.imageUrl || eventImageUrl || "");
  }, [account, eventId, eventTitle, eventImageUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!g) {
    return error ? (
      <div className="rounded-lg border border-[#B4B8C1] bg-card p-4 text-sm text-red-600">{error}</div>
    ) : (
      <div className="h-32 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" aria-busy />
    );
  }

  const state = eventPanelState(g, Date.now());
  const editable = !g.badge || g.badge.chain === "draft";

  async function issue() {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { eventId, client: "dashboard" };
    if (editable) {
      if (name.trim()) payload.name = name.trim();
      if (imageUrl.trim()) payload.imageUrl = imageUrl.trim();
    }
    const r = await credentialsRequest<{ actionId: string; count: number }>(account, "org", "event_badge_prepare", payload);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setPending(freshAction(r.data.actionId, `${r.data.count} Abzeichen vergeben: ${name.trim() || g?.badge?.name || ""}`));
    void load();
  }

  async function toggleAuto(enabled: boolean) {
    setBusy(true);
    setError(null);
    const r = await credentialsRequest<{ actionId: string }>(account, "org", "event_badge_auto", { eventId, enabled, client: "dashboard" });
    setBusy(false);
    if (!r.ok) return setError(r.code === "NOT_CONFIGURED" ? "Nicht eingerichtet." : r.message);
    setPending(freshAction(r.data.actionId, enabled ? "Sofort vergeben einschalten" : "Sofort vergeben beenden"));
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#B4B8C1] bg-card p-4">
        <div className="flex items-start gap-4">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-full border border-[#B4B8C1] object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-[#B4B8C1] text-[#00498B]">
              <Award className="h-8 w-8" aria-hidden />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm text-[#6B7280]">
              Wer an der Tür eingecheckt wurde oder den Veranstaltungs-QR gescannt hat, bekommt ein Abzeichen als Erinnerung. Du kannst später noch einmal tippen, dann
              bekommen nur die Nachzügler eins.
            </p>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                disabled={!editable}
                className="mt-1 w-full rounded-md border border-[#B4B8C1] bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Bild (Adresse)</span>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={!editable}
                placeholder="https://…"
                className="mt-1 w-full rounded-md border border-[#B4B8C1] bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            </label>
            {state.lines.map((l) => (
              <p key={l} className="text-sm font-medium text-foreground">
                {l}
              </p>
            ))}
            <button
              type="button"
              onClick={issue}
              disabled={busy || !state.primary.enabled || (pending !== null && pending.status === "awaiting_confirmation")}
              className="rounded-md bg-[#00498B] px-4 py-2 text-sm font-medium text-white hover:bg-[#00498B]/90 disabled:opacity-50"
            >
              {state.primary.label}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </div>

      {g.badge?.chain === "onchain" && (
        <div className="rounded-lg border border-[#B4B8C1] bg-card p-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={g.badge.auto} disabled={busy} onChange={(e) => void toggleAuto(e.target.checked)} className="mt-1 h-4 w-4 accent-[#00498B]" />
            <span>
              <span className="font-medium text-foreground">Sofort vergeben, während die Veranstaltung läuft</span>
              <span className="mt-1 block text-[#6B7280]">{AUTO_HELP}</span>
            </span>
          </label>
        </div>
      )}

      {pending && <PendingActionPanel action={pending} onSettled={() => void load()} onClose={() => setPending(null)} />}
    </div>
  );
}
