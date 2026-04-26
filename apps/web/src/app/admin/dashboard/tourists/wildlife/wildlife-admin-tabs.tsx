"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MONTHS_DE,
  WILDLIFE_ALARM_LABELS_DE,
  WILDLIFE_CATEGORY_LABELS_DE,
  type WildlifeSeasonalEventRecord,
  type WildlifeSightingRecord,
  type WildlifeSpeciesRecord,
} from "@/lib/supabase-tourists";
import { CrudTable } from "../_components/crud-table";
import type { ColumnDef } from "../_components/types";
import {
  deleteSeasonalEvent,
  deleteSighting,
  deleteSpecies,
  setSightingVisibility,
  upsertSeasonalEvent,
  upsertSpecies,
  verifySighting,
} from "@/app/actions/tourists-wildlife";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Check, Eye, EyeOff, Trash2 } from "lucide-react";

const SUB_TABS = [
  { key: "species", label: "Arten" },
  { key: "events", label: "Saisonkalender" },
  { key: "sightings", label: "Sichtungen" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

const MONTH_OPTIONS = MONTHS_DE.map((label, i) => ({
  value: String(i + 1),
  label: `${i + 1} – ${label}`,
}));

const SPECIES_COLUMNS: ColumnDef[] = [
  { key: "slug", label: "Slug", type: "text", required: true },
  { key: "name_de", label: "Name (DE)", type: "text", required: true },
  {
    key: "name_scientific",
    label: "Wiss. Name",
    type: "text",
    hideInList: true,
  },
  {
    key: "category",
    label: "Kategorie",
    type: "enum",
    required: true,
    options: Object.entries(WILDLIFE_CATEGORY_LABELS_DE).map(
      ([value, label]) => ({ value, label }),
    ),
  },
  { key: "is_protected", label: "Geschützt", type: "bool" },
  {
    key: "protect_coordinates",
    label: "Koord. fuzzen",
    type: "bool",
    hideInList: true,
  },
  {
    key: "description_de",
    label: "Beschreibung",
    type: "longtext",
    hideInList: true,
  },
  {
    key: "best_months",
    label: "Beste Monate",
    type: "int-array",
    hint: "z. B. 3, 4, 5 für Mär–Mai",
  },
  {
    key: "best_locations_de",
    label: "Beste Orte",
    type: "longtext",
    hideInList: true,
  },
  {
    key: "image_url",
    label: "Bild",
    type: "image",
    bucketName: "wildlife-images",
    folder: "species",
  },
  { key: "mecky_tipp_de", label: "Mecky-Tipp", type: "longtext", hideInList: true },
  {
    key: "ornitho_species_code",
    label: "ornitho-Code",
    type: "text",
    hideInList: true,
  },
  { key: "is_active", label: "Aktiv", type: "bool" },
];

interface Props {
  species: WildlifeSpeciesRecord[];
  seasonalEvents: WildlifeSeasonalEventRecord[];
  sightings: WildlifeSightingRecord[];
}

export function WildlifeAdminTabs({ species, seasonalEvents, sightings }: Props) {
  const [tab, setTab] = useState<SubTab>("species");

  const speciesFkOptions = useMemo(
    () => species.map((s) => ({ id: s.id, label: s.name_de })),
    [species],
  );

  const eventColumns: ColumnDef[] = useMemo(
    () => [
      {
        key: "species_id",
        label: "Art",
        type: "fk",
        fkOptions: speciesFkOptions,
      },
      { key: "title_de", label: "Titel", type: "text", required: true },
      {
        key: "description_de",
        label: "Beschreibung",
        type: "longtext",
        hideInList: true,
      },
      {
        key: "start_month",
        label: "Start-Monat",
        type: "enum",
        required: true,
        options: MONTH_OPTIONS,
      },
      {
        key: "end_month",
        label: "End-Monat",
        type: "enum",
        required: true,
        options: MONTH_OPTIONS,
      },
      {
        key: "start_date_hint_de",
        label: "Start-Hinweis",
        type: "text",
        hideInList: true,
      },
      {
        key: "peak_window_de",
        label: "Peak-Fenster",
        type: "text",
        hideInList: true,
      },
      {
        key: "best_location_de",
        label: "Bester Ort",
        type: "text",
        hideInList: true,
      },
      {
        key: "alarm_kind",
        label: "Alarm",
        type: "enum",
        options: Object.entries(WILDLIFE_ALARM_LABELS_DE).map(
          ([value, label]) => ({ value, label }),
        ),
      },
      { key: "trigger_hint", label: "Trigger-Hinweis", type: "text", hideInList: true },
      {
        key: "push_message_de",
        label: "Push-Nachricht",
        type: "longtext",
        hideInList: true,
      },
      { key: "is_active", label: "Aktiv", type: "bool" },
    ],
    [speciesFkOptions],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "species" && (
        <CrudTable<WildlifeSpeciesRecord>
          rows={species}
          columns={SPECIES_COLUMNS}
          title="Arten"
          searchKeys={["name_de", "name_scientific", "slug"]}
          defaultRow={
            {
              is_active: true,
              is_protected: false,
              protect_coordinates: false,
              category: "vogel",
              best_months: [],
            } as Partial<WildlifeSpeciesRecord>
          }
          onUpsert={(row) => upsertSpecies(row)}
          onDelete={(id) => deleteSpecies(id)}
        />
      )}

      {tab === "events" && (
        <CrudTable<WildlifeSeasonalEventRecord>
          rows={seasonalEvents}
          columns={eventColumns}
          title="Saison-Events"
          searchKeys={["title_de"]}
          defaultRow={
            {
              is_active: true,
              start_month: 1,
              end_month: 12,
            } as Partial<WildlifeSeasonalEventRecord>
          }
          onUpsert={(row) => {
            const normalized: Partial<WildlifeSeasonalEventRecord> = {
              ...row,
              start_month:
                row.start_month != null ? Number(row.start_month) : undefined,
              end_month:
                row.end_month != null ? Number(row.end_month) : undefined,
            };
            return upsertSeasonalEvent(normalized);
          }}
          onDelete={(id) => deleteSeasonalEvent(id)}
        />
      )}

      {tab === "sightings" && (
        <SightingsTable rows={sightings} species={species} />
      )}
    </div>
  );
}

function SightingsTable({
  rows,
  species,
}: {
  rows: WildlifeSightingRecord[];
  species: WildlifeSpeciesRecord[];
}) {
  const router = useRouter();
  const speciesById = useMemo(() => {
    const m = new Map<string, WildlifeSpeciesRecord>();
    species.forEach((s) => m.set(s.id, s));
    return m;
  }, [species]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">Sichtungen</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">Datum</th>
                <th className="text-left font-medium px-3 py-2">Art</th>
                <th className="text-left font-medium px-3 py-2">Beobachter</th>
                <th className="text-left font-medium px-3 py-2">Foto</th>
                <th className="text-left font-medium px-3 py-2">Position</th>
                <th className="text-left font-medium px-3 py-2">Anzahl</th>
                <th className="text-left font-medium px-3 py-2">Notizen</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-right font-medium px-3 py-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    Keine Sichtungen
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const sp = r.species_id ? speciesById.get(r.species_id) : null;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(r.observed_at).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">{sp?.name_de ?? "—"}</td>
                      <td className="px-3 py-2">{r.observer_name_de ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.photo_url}
                            alt=""
                            className="h-10 w-10 object-cover rounded"
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
                      </td>
                      <td className="px-3 py-2">{r.individual_count}</td>
                      <td
                        className="px-3 py-2 max-w-[240px] truncate"
                        title={r.notes_de ?? ""}
                      >
                        {r.notes_de ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={r.verified_by_mecky ? "default" : "secondary"}
                          >
                            {r.verified_by_mecky ? "Verifiziert" : "Offen"}
                          </Badge>
                          {!r.is_visible && (
                            <Badge variant="destructive">Versteckt</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title={
                              r.verified_by_mecky
                                ? "Verifizierung entfernen"
                                : "Verifizieren"
                            }
                            onClick={async () => {
                              const res = await verifySighting(
                                r.id,
                                !r.verified_by_mecky,
                              );
                              if (res.success) {
                                toast({ title: "Aktualisiert" });
                                router.refresh();
                              }
                            }}
                          >
                            <Check
                              className={
                                r.verified_by_mecky
                                  ? "h-4 w-4 text-emerald-600"
                                  : "h-4 w-4"
                              }
                            />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={r.is_visible ? "Verstecken" : "Sichtbar machen"}
                            onClick={async () => {
                              const res = await setSightingVisibility(
                                r.id,
                                !r.is_visible,
                              );
                              if (res.success) {
                                toast({ title: "Aktualisiert" });
                                router.refresh();
                              }
                            }}
                          >
                            {r.is_visible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Löschen"
                            onClick={async () => {
                              if (!confirm("Sichtung löschen?")) return;
                              const res = await deleteSighting(r.id);
                              if (res.success) {
                                toast({ title: "Gelöscht" });
                                router.refresh();
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
