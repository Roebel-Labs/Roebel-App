"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { liveAdmin, liveAdminSafe } from "./api";
import type { LiveShow } from "../types";

interface InputInfo {
  rtmps_url: string | null;
  stream_key: string | null;
  srt_url: string | null;
  srt_stream_id: string | null;
  srt_passphrase: string | null;
  state: string | null;
  connected: boolean | null;
  hls_url: string | null;
}

interface Output {
  uid: string;
  url: string;
  enabled: boolean;
  state: string | null;
}

const PRESETS = [
  { label: "YouTube", url: "rtmp://a.rtmp.youtube.com/live2" },
  { label: "Facebook", url: "rtmps://live-api-s.facebook.com:443/rtmp/" },
];

function platformOf(url: string): string {
  if (url.includes("youtube")) return "YouTube";
  if (url.includes("facebook")) return "Facebook";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function copy(text: string | null) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Kopiert");
  } catch {
    toast.error("Kopieren nicht möglich");
  }
}

function SecretRow({ label, value, secret }: { label: string; value: string | null; secret?: boolean }) {
  const [revealed, setRevealed] = useState(!secret);
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value ? (revealed ? value : "•".repeat(Math.min(32, value.length))) : "—"}
          className="font-mono text-xs"
          onFocus={(e) => revealed && e.currentTarget.select()}
        />
        {secret && (
          <Button variant="outline" size="icon" onClick={() => setRevealed((r) => !r)} aria-label={revealed ? "Verbergen" : "Anzeigen"}>
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={() => copy(value)} disabled={!value} aria-label="Kopieren">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CloudflarePanel({ show, onChanged }: { show: LiveShow; onChanged: () => void }) {
  const [info, setInfo] = useState<InputInfo | null>(null);
  const [showCreds, setShowCreds] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [newUrl, setNewUrl] = useState(PRESETS[0].url);
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const hasInput = !!show.cf_live_input_id;

  const loadInfo = useCallback(async () => {
    if (!hasInput) return;
    setLoadingInfo(true);
    try {
      setInfo(await liveAdmin<InputInfo>("cf_input_info", show.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingInfo(false);
    }
  }, [hasInput, show.id]);

  const loadOutputs = useCallback(async () => {
    if (!hasInput) return;
    const res = await liveAdminSafe<{ outputs: Output[] }>("cf_list_outputs", show.id);
    if (res) setOutputs(res.outputs ?? []);
  }, [hasInput, show.id]);

  useEffect(() => {
    setInfo(null);
    setOutputs(null);
    setShowCreds(false);
    if (hasInput) {
      loadInfo();
      loadOutputs();
    }
  }, [hasInput, loadInfo, loadOutputs]);

  // Keep the connection state fresh while the panel is open.
  useEffect(() => {
    if (!hasInput) return;
    const t = window.setInterval(loadInfo, 15_000);
    return () => window.clearInterval(t);
  }, [hasInput, loadInfo]);

  const create = async () => {
    setCreating(true);
    const res = await liveAdminSafe("cf_create_input", show.id, {}, "Live-Input angelegt");
    setCreating(false);
    if (res) onChanged();
  };

  const addOutput = async () => {
    if (!newUrl.trim() || !newKey.trim()) return;
    setAdding(true);
    const res = await liveAdminSafe("cf_add_output", show.id, { url: newUrl.trim(), stream_key: newKey.trim() }, "Weiterleitung hinzugefügt");
    setAdding(false);
    if (res) {
      setNewKey("");
      loadOutputs();
    }
  };

  const deleteOutput = async (o: Output) => {
    if (!window.confirm(`Weiterleitung zu ${platformOf(o.url)} löschen?`)) return;
    const res = await liveAdminSafe("cf_delete_output", show.id, { output_id: o.uid }, "Weiterleitung gelöscht");
    if (res) loadOutputs();
  };

  const connected = info?.connected ?? (info?.state === "connected" ? true : null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Cloudflare Stream</CardTitle>
        {hasInput && (
          <div className="flex items-center gap-2">
            {connected === true ? (
              <Badge variant="success">OBS verbunden</Badge>
            ) : connected === false ? (
              <Badge variant="warning">Kein Signal</Badge>
            ) : (
              <Badge variant="pending">{info?.state ?? "unbekannt"}</Badge>
            )}
            <Button variant="ghost" size="icon" onClick={loadInfo} disabled={loadingInfo} aria-label="Aktualisieren">
              <RefreshCw className={`h-4 w-4 ${loadingInfo ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasInput ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Für diese Übertragung gibt es noch keinen Live-Input. Der Input liefert die RTMPS-Zugangsdaten für OBS und die
              HLS-Adresse für die App.
            </p>
            <Button onClick={create} disabled={creating}>
              Live-Input anlegen
            </Button>
          </div>
        ) : (
          <>
            {!showCreds ? (
              <Button variant="outline" onClick={() => setShowCreds(true)}>
                Zugangsdaten für OBS anzeigen
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">
                  OBS → Einstellungen → Stream → Dienst „Benutzerdefiniert“. Den Schlüssel nie teilen oder zeigen.
                </div>
                <SecretRow label="Server (RTMPS)" value={info?.rtmps_url ?? null} />
                <SecretRow label="Streamschlüssel" value={info?.stream_key ?? null} secret />
                {info?.srt_url && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">SRT (optional)</summary>
                    <div className="mt-2 space-y-3">
                      <SecretRow label="SRT-URL" value={info.srt_url} />
                      <SecretRow label="Stream-ID" value={info.srt_stream_id} secret />
                      <SecretRow label="Passphrase" value={info.srt_passphrase} secret />
                    </div>
                  </details>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowCreds(false)}>
                  Zugangsdaten verbergen
                </Button>
              </div>
            )}
            {info?.hls_url && <SecretRow label="HLS (App / Web)" value={info.hls_url} />}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">Weiterleitungen (Simulcast)</div>
                <Button variant="ghost" size="sm" onClick={loadOutputs}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Neu laden
                </Button>
              </div>
              <div className="space-y-2">
                {outputs === null && <div className="text-sm text-muted-foreground">Lädt …</div>}
                {outputs?.length === 0 && <div className="text-sm text-muted-foreground">Keine Weiterleitungen.</div>}
                {outputs?.map((o) => (
                  <div key={o.uid} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{platformOf(o.url)}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{o.url}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={o.state === "connected" ? "success" : o.enabled ? "pending" : "outline"}>
                        {o.state === "connected" ? "sendet" : o.enabled ? o.state ?? "bereit" : "aus"}
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => deleteOutput(o)} aria-label="Löschen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      size="sm"
                      variant={newUrl === p.url ? "default" : "outline"}
                      onClick={() => setNewUrl(p.url)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="rtmps://…" className="font-mono text-xs" />
                <Input
                  type="password"
                  autoComplete="off"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Streamschlüssel der Plattform"
                  className="font-mono text-xs"
                />
                <Button onClick={addOutput} disabled={adding || !newUrl.trim() || !newKey.trim()}>
                  Weiterleitung hinzufügen
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
