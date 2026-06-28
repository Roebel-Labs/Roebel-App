import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Address } from "viem";
import { Card, ChartCard, PageHeader } from "../components/ui";
import { Ticket, Printer, Plus, Sparkles } from "../components/icons";
import coin3d from "../assets/roebel-coin-3d.png";
import { SUPABASE_URL, SUPABASE_ANON as ANON } from "../lib/supabase";
import { track } from "../lib/analytics";

// The Röbel app scans this and reads the event id from /e/<id>.
const EVENT_BASE = "https://www.roebel.app/e/";

const DURATIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "Today (24 h)", hours: 24 },
  { label: "1 week", hours: 168 },
];

const PRINT_CSS = `
.print-only { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  body * { visibility: hidden !important; }
  #event-print, #event-print * { visibility: visible !important; }
  #event-print { display: block !important; position: absolute; inset: 0; }
}
.a4 { width: 210mm; min-height: 297mm; background: #fff; color: #00498B; box-sizing: border-box;
  padding: 28mm 24mm; text-align: center; font-family: Inter, system-ui, sans-serif; }
.a4-kicker { letter-spacing: .35em; font-size: 12pt; color: #00498B; font-weight: 700; margin: 0 0 6mm; }
.a4-title { font-size: 34pt; font-weight: 800; line-height: 1.05; margin: 0 0 4mm; }
.a4-sub { font-size: 17pt; color: #525252; margin: 0 0 16mm; }
.a4-qr { display: flex; justify-content: center; margin: 0 0 14mm; }
.a4-steps { font-size: 15pt; line-height: 1.5; color: #00498B; margin: 0 0 18mm; }
.a4-foot { font-size: 11pt; color: #a3a3a3; }
`;

export default function EventInviteView({ inviter }: { inviter: Address | null }) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(24);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<{ id: string; label: string; expiresAt: string } | null>(null);

  if (!inviter) {
    return (
      <div className="space-y-4">
        <PageHeader title="Event invite" description="Create a QR code for a local event." />
        <Card className="p-5 text-[13px] leading-relaxed text-muted-foreground">
          Open this mini-app inside the Circles app to connect your wallet — then, as a citizen, you can create an event QR code.
        </Card>
      </div>
    );
  }

  const create = async () => {
    if (!label.trim()) {
      setError("Please enter an event name.");
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
      if (!res.ok || !j.id) throw new Error(j.error || "Could not create event");
      setEvent({ id: j.id, label: label.trim(), expiresAt });
      track("event_created", { hours });
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
      <PageHeader title="Event invite" description="A QR code for a local event: guests join Circles and everyone collects a few Röbel Coins as a 'was-in-Röbel' proof — paid from the town treasury, not from you." />

      {!event ? (
        <ChartCard>
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#00498B]/10 text-[#00498B]">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Create event QR</h3>
              <p className="text-xs text-muted-foreground">Guests scan → join Circles → collect coins</p>
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Event name</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Röbel weekly market"
              maxLength={80}
              className="mt-1.5 w-full rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm outline-none transition focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/15"
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Valid for</span>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="mt-1.5 w-full rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm outline-none transition focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/15"
            >
              {DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="mt-2 text-sm font-medium text-foreground">{error}</p>}

          <button
            onClick={create}
            disabled={creating}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#00498B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4e99] active:scale-[0.99] disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Creating…" : "Create event QR"}
          </button>
        </ChartCard>
      ) : (
        <>
          <Card className="p-5 text-center">
            <img src={coin3d} alt="" className="mx-auto mb-2 h-16 w-16 drop-shadow-[0_10px_18px_rgba(10,10,10,0.12)]" />
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#00498B]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#00498B]">
              <Sparkles className="h-3 w-3" /> Event live
            </div>
            <h3 className="font-display text-lg font-bold tracking-tight text-foreground">{event.label}</h3>
            <div className="my-4 flex justify-center">
              <div className="rounded-[10px] border border-border bg-white p-4 shadow-sm">
                <QRCodeSVG value={link} size={208} level="M" fgColor="#0a0a0a" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Valid until {new Date(event.expiresAt).toLocaleString("en-US")}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#00498B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4e99] active:scale-[0.99]"
              >
                <Printer className="h-4 w-4" />
                Print A4 poster
              </button>
              <button
                onClick={() => setEvent(null)}
                className="rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground active:scale-[0.99]"
              >
                New
              </button>
            </div>
          </Card>

          {/* A4 print layout — hidden on screen, shown only when printing/saving as PDF */}
          <div id="event-print" className="print-only">
            <div className="a4">
              <p className="a4-kicker">RÖBEL · CIRCLES</p>
              <h1 className="a4-title">Become part of Röbel</h1>
              <p className="a4-sub">{event.label}</p>
              <div className="a4-qr">
                <QRCodeSVG value={link} size={340} level="M" fgColor="#00498B" />
              </div>
              <p className="a4-steps">
                Scan the code with the Röbel app
                <br />
                → join Circles → collect your coins
              </p>
              <p className="a4-foot">Valid until {new Date(event.expiresAt).toLocaleString("en-US")} · roebel.app</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
