import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Address } from "viem";

// Public Supabase project + anon key (publishable; safe in client). The edge fns gate
// server-side (create-reward-event requires CitizenNFT).
const SUPABASE_URL = "https://wwbeqhkslxdxhktqzqti.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3YmVxaGtzbHhkeGhrdHF6cXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTUyMTIsImV4cCI6MjA2ODY5MTIxMn0.ETISOumSNns3OVO-FC10FDQAZQVdJnubx3Qu_iHGHGI";
// The Röbel app scans this and reads the event id from /e/<id>.
const EVENT_BASE = "https://www.roebel.app/e/";

const DURATIONS = [
  { label: "1 Stunde", hours: 1 },
  { label: "4 Stunden", hours: 4 },
  { label: "Heute (24 h)", hours: 24 },
  { label: "1 Woche", hours: 168 },
];

const PRINT_CSS = `
.print-only { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  body * { visibility: hidden !important; }
  #event-print, #event-print * { visibility: visible !important; }
  #event-print { display: block !important; position: absolute; inset: 0; }
}
.a4 { width: 210mm; min-height: 297mm; background: #fff; color: #194383; box-sizing: border-box;
  padding: 28mm 24mm; text-align: center; font-family: 'Plus Jakarta Sans', Inter, system-ui, sans-serif; }
.a4-kicker { letter-spacing: .35em; font-size: 12pt; color: #194383; font-weight: 700; margin: 0 0 6mm; }
.a4-title { font-size: 34pt; font-weight: 800; line-height: 1.05; margin: 0 0 4mm; }
.a4-sub { font-size: 17pt; color: #475569; margin: 0 0 16mm; }
.a4-qr { display: flex; justify-content: center; margin: 0 0 14mm; }
.a4-steps { font-size: 15pt; line-height: 1.5; color: #194383; margin: 0 0 18mm; }
.a4-foot { font-size: 11pt; color: #94a3b8; }
`;

export default function EventInviteView({ inviter }: { inviter: Address | null }) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(24);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<{ id: string; label: string; expiresAt: string } | null>(null);

  if (!inviter) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Öffne diese Mini-App in der Circles-App, um dein Wallet zu verbinden — dann kannst du als Bürger:in ein Event-QR erstellen.
      </div>
    );
  }

  const create = async () => {
    if (!label.trim()) {
      setError("Bitte einen Event-Namen eingeben.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-reward-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify({ creator: inviter, label: label.trim(), expiresAt }),
      });
      const j = await res.json();
      if (!res.ok || !j.id) throw new Error(j.error || "Konnte Event nicht erstellen");
      setEvent({ id: j.id, label: label.trim(), expiresAt });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const link = event ? `${EVENT_BASE}${event.id}` : "";

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

      {!event ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold text-navy">Event-Einladung erstellen</h2>
            <p className="text-sm text-slate-500">
              Ein QR-Code für ein lokales Event: Gäste treten Circles bei und sammeln eigene Münzen, alle erhalten ein paar
              Röbel Münzen als „War-in-Röbel“-Beleg. Bezahlt aus der Stadtkasse — nicht von dir.
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Event-Name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z. B. Röbel Wochenmarkt"
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Gültig für
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={create}
            disabled={creating}
            className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {creating ? "Wird erstellt…" : "Event-QR erstellen"}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-center">
            <h2 className="text-lg font-semibold text-navy">{event.label}</h2>
            <div className="flex justify-center">
              <QRCodeSVG value={link} size={220} level="M" />
            </div>
            <p className="text-xs text-slate-500">Gültig bis {new Date(event.expiresAt).toLocaleString("de-DE")}</p>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex-1 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white">
                Als A4-PDF drucken
              </button>
              <button onClick={() => setEvent(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600">
                Neu
              </button>
            </div>
          </div>

          {/* A4 print layout — hidden on screen, shown only when printing/saving as PDF */}
          <div id="event-print" className="print-only">
            <div className="a4">
              <p className="a4-kicker">RÖBEL · CIRCLES</p>
              <h1 className="a4-title">Werde Teil von Röbel</h1>
              <p className="a4-sub">{event.label}</p>
              <div className="a4-qr">
                <QRCodeSVG value={link} size={340} level="M" />
              </div>
              <p className="a4-steps">
                Scanne den Code mit der Röbel-App
                <br />
                → tritt Circles bei → sammle deine Münzen
              </p>
              <p className="a4-foot">Gültig bis {new Date(event.expiresAt).toLocaleString("de-DE")} · roebel.app</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
