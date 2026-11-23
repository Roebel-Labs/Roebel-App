"use client";

// "Mit einer Vorlage starten" on the editor start screen. Opening a template is a full
// navigation to /editor?template=<id>, which loads it as version 1.
import { useEffect, useState } from "react";

interface TemplateCard {
  id: string;
  title: string;
  summary: string;
  group: string;
  recommended?: boolean;
  thumbnailSvg: string;
}

interface Group {
  id: string;
  label: string;
}

export function TemplateGallery() {
  const [templates, setTemplates] = useState<TemplateCard[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [group, setGroup] = useState<string>("alle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mini-apps/templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setTemplates(json.templates ?? []);
        setGroups(json.groups ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!templates || templates.length === 0) return null;
  const used = groups.filter((g) => templates.some((t) => t.group === g.id));
  const visible = group === "alle" ? templates : templates.filter((t) => t.group === group);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Mit einer Vorlage starten</h2>
        <p className="text-xs text-muted-foreground">Fertige App laden und im Chat anpassen.</p>
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: "alle", label: "Alle" }, ...used].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={
              "h-7 shrink-0 rounded-full border px-3 text-xs " +
              (g.id === group
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {visible.map((t) => (
          <a
            key={t.id}
            href={`/editor?template=${encodeURIComponent(t.id)}`}
            className="group overflow-hidden rounded-[14px] border border-border bg-card text-left hover:border-primary"
          >
            <div
              className="relative aspect-[16/9] w-full [&>svg]:h-full [&>svg]:w-full"
              // Static SVG from our own template catalogue.
              dangerouslySetInnerHTML={{ __html: t.thumbnailSvg }}
            />
            <div className="p-3">
              <div className="flex items-center gap-2">
                <p className="font-heading text-sm font-semibold text-foreground">{t.title}</p>
                {t.recommended ? (
                  <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                    Empfohlen
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.summary}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
