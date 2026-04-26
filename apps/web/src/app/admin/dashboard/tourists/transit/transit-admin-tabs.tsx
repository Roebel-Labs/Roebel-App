"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TRANSIT_MODE_LABELS_DE,
  type TransitDepartureRecord,
  type TransitLineRecord,
  type TransitStopRecord,
} from "@/lib/supabase-tourists";
import { CrudTable } from "../_components/crud-table";
import type { ColumnDef } from "../_components/types";
import {
  deleteTransitDeparture,
  deleteTransitLine,
  deleteTransitStop,
  upsertTransitDeparture,
  upsertTransitLine,
  upsertTransitStop,
} from "@/app/actions/tourists-transit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SUB_TABS = [
  { key: "lines", label: "Linien" },
  { key: "stops", label: "Haltestellen" },
  { key: "departures", label: "Abfahrten" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

const LINE_COLUMNS: ColumnDef[] = [
  { key: "code", label: "Code", type: "text", required: true },
  { key: "name_de", label: "Name", type: "text", required: true },
  {
    key: "mode",
    label: "Modus",
    type: "enum",
    required: true,
    options: Object.entries(TRANSIT_MODE_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  { key: "operator_de", label: "Betreiber", type: "text", hideInList: true },
  { key: "fare_de", label: "Tarif", type: "text", hideInList: true },
  { key: "season_window_de", label: "Saison", type: "text", hideInList: true },
  { key: "call_phone", label: "Telefon", type: "text", hideInList: true },
  { key: "call_email", label: "E-Mail", type: "text", hideInList: true },
  { key: "call_window_de", label: "Anrufzeiten", type: "text", hideInList: true },
  { key: "website", label: "Website", type: "text", hideInList: true },
  { key: "notes_de", label: "Notizen", type: "longtext", hideInList: true },
  { key: "free_with_gaestekarte", label: "Frei mit Gästekarte", type: "bool", hideInList: true },
  { key: "carries_bikes", label: "Fahrradtransport", type: "bool", hideInList: true },
  { key: "bike_fee_eur", label: "Fahrradgebühr €", type: "number", step: 0.01, hideInList: true },
  { key: "is_electric", label: "Elektrisch", type: "bool", hideInList: true },
  { key: "is_volunteer", label: "Ehrenamtlich", type: "bool", hideInList: true },
  { key: "is_active", label: "Aktiv", type: "bool" },
];

interface Props {
  lines: TransitLineRecord[];
  stops: TransitStopRecord[];
  departures: TransitDepartureRecord[];
}

export function TransitAdminTabs({ lines, stops, departures }: Props) {
  const [tab, setTab] = useState<SubTab>("lines");
  const [filterLineId, setFilterLineId] = useState<string>("all");

  const lineFkOptions = useMemo(
    () => lines.map((l) => ({ id: l.id, label: `${l.code} – ${l.name_de}` })),
    [lines],
  );

  const stopColumns: ColumnDef[] = useMemo(
    () => [
      {
        key: "line_id",
        label: "Linie",
        type: "fk",
        required: true,
        fkOptions: lineFkOptions,
      },
      { key: "name_de", label: "Name", type: "text", required: true },
      { key: "stop_order", label: "Reihenfolge", type: "number", required: true },
      { key: "lat", label: "Lat", type: "number", step: 0.000001, hideInList: true },
      { key: "lon", label: "Lon", type: "number", step: 0.000001, hideInList: true },
      { key: "notes_de", label: "Notizen", type: "longtext", hideInList: true },
      { key: "is_active", label: "Aktiv", type: "bool" },
    ],
    [lineFkOptions],
  );

  const stopFkOptions = useMemo(
    () => stops.map((s) => ({ id: s.id, label: s.name_de })),
    [stops],
  );

  const departureColumns: ColumnDef[] = useMemo(
    () => [
      {
        key: "line_id",
        label: "Linie",
        type: "fk",
        required: true,
        fkOptions: lineFkOptions,
      },
      {
        key: "stop_id",
        label: "Haltestelle",
        type: "fk",
        fkOptions: stopFkOptions,
      },
      {
        key: "departure_time",
        label: "Abfahrt",
        type: "time",
        required: true,
      },
      { key: "arrival_time", label: "Ankunft", type: "time", hideInList: true },
      { key: "destination_de", label: "Ziel", type: "text" },
      {
        key: "service_days",
        label: "Wochentage",
        type: "text",
        hint: "Komma-getrennt: mo,tu,we,th,fr,sa,su",
      },
      { key: "season_start", label: "Saison-Start", type: "date", hideInList: true },
      { key: "season_end", label: "Saison-Ende", type: "date", hideInList: true },
      { key: "trip_label_de", label: "Fahrt-Label", type: "text", hideInList: true },
      { key: "notes_de", label: "Notizen", type: "longtext", hideInList: true },
      { key: "is_last_of_day", label: "Letzte des Tages", type: "bool", hideInList: true },
      { key: "is_active", label: "Aktiv", type: "bool" },
    ],
    [lineFkOptions, stopFkOptions],
  );

  const filteredStops =
    filterLineId === "all"
      ? stops
      : stops.filter((s) => s.line_id === filterLineId);
  const filteredDepartures =
    filterLineId === "all"
      ? departures
      : departures.filter((d) => d.line_id === filterLineId);

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

      {tab !== "lines" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Linie filtern:</span>
          <Select value={filterLineId} onValueChange={setFilterLineId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Linien</SelectItem>
              {lines.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.code} – {l.name_de}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {tab === "lines" && (
        <CrudTable<TransitLineRecord>
          rows={lines}
          columns={LINE_COLUMNS}
          title="Linien"
          searchKeys={["code", "name_de", "operator_de"]}
          defaultRow={{ is_active: true } as Partial<TransitLineRecord>}
          onUpsert={(row) => upsertTransitLine(row)}
          onDelete={(id) => deleteTransitLine(id)}
        />
      )}

      {tab === "stops" && (
        <CrudTable<TransitStopRecord>
          rows={filteredStops}
          columns={stopColumns}
          title="Haltestellen"
          searchKeys={["name_de"]}
          defaultRow={
            {
              is_active: true,
              line_id: filterLineId !== "all" ? filterLineId : undefined,
              stop_order: 0,
            } as Partial<TransitStopRecord>
          }
          onUpsert={(row) => upsertTransitStop(row)}
          onDelete={(id) => deleteTransitStop(id)}
        />
      )}

      {tab === "departures" && (
        <CrudTable<TransitDepartureRecord>
          rows={filteredDepartures}
          columns={departureColumns}
          title="Abfahrten"
          searchKeys={["destination_de", "trip_label_de"]}
          defaultRow={
            {
              is_active: true,
              service_days: "mo,tu,we,th,fr,sa,su",
              line_id: filterLineId !== "all" ? filterLineId : undefined,
            } as Partial<TransitDepartureRecord>
          }
          onUpsert={(row) => upsertTransitDeparture(row)}
          onDelete={(id) => deleteTransitDeparture(id)}
        />
      )}
    </div>
  );
}
