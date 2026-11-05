"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { liveAdminSafe } from "./api";
import type { LiveShow } from "../types";

type Fields = { title: string; subtitle: string; poster_url: string; hls_url: string; replay_url: string; starts_at: string };

/** ISO → value for <input type="datetime-local"> in the operator's local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromShow(show: LiveShow): Fields {
  return {
    title: show.title ?? "",
    subtitle: show.subtitle ?? "",
    poster_url: show.poster_url ?? "",
    hls_url: show.hls_url ?? "",
    replay_url: show.replay_url ?? "",
    starts_at: toLocalInput(show.starts_at),
  };
}

const FIELDS: { key: keyof Fields; label: string; placeholder?: string; type?: string }[] = [
  { key: "title", label: "Titel" },
  { key: "subtitle", label: "Untertitel" },
  { key: "starts_at", label: "Beginn", type: "datetime-local" },
  { key: "poster_url", label: "Vorschaubild (URL)", placeholder: "https://…" },
  { key: "hls_url", label: "HLS-Adresse (manuell)", placeholder: "https://…/manifest/video.m3u8" },
  { key: "replay_url", label: "Aufzeichnung (URL)", placeholder: "https://…" },
];

export function SettingsPanel({ show, onChanged }: { show: LiveShow; onChanged: () => void }) {
  const [f, setF] = useState<Fields>(() => fromShow(show));
  const [saving, setSaving] = useState(false);
  // Reset the form when switching shows (not on every realtime update, so typing isn't clobbered).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(fromShow(show)), [show.id]);

  const original = fromShow(show);
  const dirty = (Object.keys(f) as (keyof Fields)[]).filter((k) => f[k] !== original[k]);

  const save = async () => {
    if (dirty.length === 0) return;
    const payload: Record<string, string> = {};
    for (const k of dirty) {
      payload[k] = k === "starts_at" ? (f.starts_at ? new Date(f.starts_at).toISOString() : "") : f[k];
    }
    if ("title" in payload && !payload.title.trim()) {
      delete payload.title;
    }
    setSaving(true);
    const res = await liveAdminSafe("set_flags", show.id, payload, "Einstellungen gespeichert");
    setSaving(false);
    if (res) onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Einstellungen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {FIELDS.map((fd) => (
          <div key={fd.key} className="space-y-1">
            <Label htmlFor={`live-${fd.key}`} className="text-xs">
              {fd.label}
            </Label>
            <Input
              id={`live-${fd.key}`}
              type={fd.type ?? "text"}
              value={f[fd.key]}
              placeholder={fd.placeholder}
              onChange={(e) => setF({ ...f, [fd.key]: e.target.value })}
              className={fd.key.endsWith("_url") ? "font-mono text-xs" : undefined}
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving || dirty.length === 0}>
            Speichern
          </Button>
          {dirty.length > 0 && (
            <Button variant="ghost" onClick={() => setF(original)}>
              Verwerfen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
