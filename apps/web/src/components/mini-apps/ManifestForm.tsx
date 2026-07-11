"use client";

// Shared submit/edit manifest form for the builder dashboard. Validated
// server-side on submit; this does light client-side hints only.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CATEGORIES,
  PERMISSIONS,
  DEFAULT_PRIMARY_COLOR,
} from "@/lib/miniapp/manifest";
import { categoryLabel } from "./ui";
import { ScreenshotManager } from "./ScreenshotManager";
import type { MiniAppManifest, MiniAppRow } from "@/lib/miniapp/types";

export interface ManifestFormValue {
  slug: string;
  name: string;
  iconUrl: string;
  homeUrl: string;
  description: string;
  category: string;
  tags: string;
  screenshots: string[];
  permissions: string[];
  primaryColor: string;
}

function fromApp(app?: MiniAppRow | null): ManifestFormValue {
  return {
    slug: app?.slug ?? "",
    name: app?.name ?? "",
    iconUrl: app?.icon_url ?? "",
    homeUrl: app?.home_url ?? "",
    description: app?.description ?? "",
    category: app?.category ?? "utility",
    tags: (app?.tags ?? []).join(", "),
    screenshots: app?.screenshots ?? [],
    permissions: app?.permissions ?? [],
    primaryColor: app?.primary_color ?? DEFAULT_PRIMARY_COLOR,
  };
}

export function toManifest(v: ManifestFormValue): MiniAppManifest {
  return {
    slug: v.slug.trim().toLowerCase(),
    name: v.name.trim(),
    iconUrl: v.iconUrl.trim(),
    homeUrl: v.homeUrl.trim(),
    description: v.description.trim(),
    category: v.category as MiniAppManifest["category"],
    tags: v.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    screenshots: v.screenshots.map((s) => s.trim()).filter(Boolean),
    permissions: v.permissions as MiniAppManifest["permissions"],
    primaryColor: v.primaryColor,
  };
}

export function ManifestForm({
  app,
  submitLabel,
  onSubmit,
  busy,
  hideImageFields,
}: {
  app?: MiniAppRow | null;
  submitLabel: string;
  onSubmit: (manifest: MiniAppManifest) => void;
  busy?: boolean;
  /**
   * Edit surfaces with a "Bilder" section set this: the icon/preview fields
   * disappear and the submit sends them EMPTY — the server keeps the stored
   * images (AI-built apps carry a data:-URI icon that would otherwise fail
   * the https validation and block every save).
   */
  hideImageFields?: boolean;
}) {
  const [v, setV] = useState<ManifestFormValue>(() => fromApp(app));

  function set<K extends keyof ManifestFormValue>(key: K, val: ManifestFormValue[K]) {
    setV((prev) => ({ ...prev, [key]: val }));
  }
  function togglePerm(p: string) {
    setV((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(p)
        ? prev.permissions.filter((x) => x !== p)
        : [...prev.permissions, p],
    }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const m = toManifest(v);
        onSubmit(hideImageFields ? { ...m, iconUrl: "", screenshots: [] } : m);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={v.name}
            maxLength={32}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="slug">slug (URL-tauglich)</Label>
          <Input
            id="slug"
            value={v.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="mein-app"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="homeUrl">home_url (Einstiegs-URL)</Label>
        <Input
          id="homeUrl"
          type="url"
          value={v.homeUrl}
          onChange={(e) => set("homeUrl", e.target.value)}
          placeholder="https://…"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea
          id="description"
          value={v.description}
          maxLength={200}
          rows={3}
          onChange={(e) => set("description", e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{v.description.length}/200</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">Kategorie</Label>
          <select
            id="category"
            value={v.category}
            onChange={(e) => set("category", e.target.value)}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="primaryColor">Primärfarbe</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(v.primaryColor) ? v.primaryColor : "#00498B"}
              onChange={(e) => set("primaryColor", e.target.value)}
              className="h-10 w-12 rounded border border-input"
            />
            <Input
              id="primaryColor"
              value={v.primaryColor}
              onChange={(e) => set("primaryColor", e.target.value)}
            />
          </div>
        </div>
      </div>

      {hideImageFields ? null : (
        <div>
          <Label htmlFor="iconUrl">Icon-URL (1024×1024 PNG)</Label>
          <Input
            id="iconUrl"
            type="url"
            value={v.iconUrl}
            onChange={(e) => set("iconUrl", e.target.value)}
            placeholder="https://…/icon.png"
          />
        </div>
      )}

      <div>
        <Label htmlFor="tags">Tags (Komma-getrennt, max. 5)</Label>
        <Input
          id="tags"
          value={v.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="lokal, verein, kultur"
        />
      </div>

      {hideImageFields ? null : (
        <div>
          <Label>Vorschaubilder (1:1)</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Quadratische Bilder, die auf der Mini-App-Seite in einer Reihe erscheinen.
          </p>
          <ScreenshotManager
            value={v.screenshots}
            onChange={(imgs) => set("screenshots", imgs)}
          />
        </div>
      )}

      <div>
        <Label>Berechtigungen</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {PERMISSIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePerm(p)}
              className={
                v.permissions.includes(p)
                  ? "rounded-full border border-[#00498B] bg-[#00498B]/10 px-3 py-1 text-xs font-medium text-[#00498B]"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground/40"
              }
            >
              {p}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Nur angeforderte + freigegebene Berechtigungen werden zur Laufzeit erlaubt.
        </p>
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? "Wird gesendet…" : submitLabel}
      </Button>
    </form>
  );
}
