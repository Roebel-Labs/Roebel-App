"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ADVISORY_LEVEL_LABELS_DE,
  ADVISORY_TYPE_LABELS_DE,
  HELP_REQUEST_STATUS_LABELS_DE,
  HELP_REQUEST_TYPE_LABELS_DE,
  POI_STATUS_LABELS_DE,
  POI_TYPE_LABELS_DE,
  type AdvisoryRecord,
  type HelpRequestRecord,
  type PoiRecord,
} from "@/lib/supabase-tourists";
import { CrudTable } from "../_components/crud-table";
import type { ColumnDef } from "../_components/types";
import {
  deleteAdvisory,
  deletePoi,
  setHelpRequestStatus,
  upsertAdvisory,
  upsertPoi,
} from "@/app/actions/tourists-pois";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

const SUB_TABS = [
  { key: "pois", label: "POIs" },
  { key: "advisories", label: "Tagesaktuell" },
  { key: "help", label: "Hilferufe" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

const POI_COLUMNS: ColumnDef[] = [
  {
    key: "type",
    label: "Typ",
    type: "enum",
    required: true,
    options: Object.entries(POI_TYPE_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  { key: "name_de", label: "Name", type: "text", required: true },
  { key: "description_de", label: "Beschreibung", type: "longtext", hideInList: true },
  { key: "lat", label: "Lat", type: "number", required: true, step: 0.000001 },
  { key: "lon", label: "Lon", type: "number", required: true, step: 0.000001 },
  { key: "address", label: "Adresse", type: "text", hideInList: true },
  { key: "phone", label: "Telefon", type: "text", hideInList: true },
  { key: "email", label: "E-Mail", type: "text", hideInList: true },
  { key: "website", label: "Website", type: "text", hideInList: true },
  { key: "opening_hours_de", label: "Öffnungszeiten", type: "text", hideInList: true },
  { key: "is_24h", label: "24h", type: "bool" },
  {
    key: "is_pannendienst",
    label: "Pannendienst",
    type: "bool",
    hideInList: true,
  },
  {
    key: "has_gaestekarte_discount",
    label: "Gästekarte",
    type: "bool",
    hideInList: true,
  },
  {
    key: "status",
    label: "Status",
    type: "enum",
    options: Object.entries(POI_STATUS_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  { key: "status_note_de", label: "Status-Notiz", type: "text", hideInList: true },
  {
    key: "status_source_de",
    label: "Status-Quelle",
    type: "text",
    hideInList: true,
  },
  { key: "is_active", label: "Aktiv", type: "bool" },
];

const ADVISORY_COLUMNS: ColumnDef[] = [
  { key: "advisory_date", label: "Datum", type: "date", required: true },
  {
    key: "type",
    label: "Typ",
    type: "enum",
    required: true,
    options: Object.entries(ADVISORY_TYPE_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  {
    key: "level",
    label: "Stufe",
    type: "enum",
    required: true,
    options: Object.entries(ADVISORY_LEVEL_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  { key: "message_de", label: "Nachricht", type: "longtext", required: true },
  {
    key: "recommendation_de",
    label: "Empfehlung",
    type: "longtext",
    hideInList: true,
  },
];

interface Props {
  pois: PoiRecord[];
  advisories: AdvisoryRecord[];
  helpRequests: HelpRequestRecord[];
}

export function PoisAdminTabs({ pois, advisories, helpRequests }: Props) {
  const [tab, setTab] = useState<SubTab>("pois");

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

      {tab === "pois" && (
        <CrudTable<PoiRecord>
          rows={pois}
          columns={POI_COLUMNS}
          title="Points of Interest"
          searchKeys={["name_de", "address"]}
          defaultRow={{ is_active: true, is_24h: false } as Partial<PoiRecord>}
          onUpsert={(row) => upsertPoi(row)}
          onDelete={(id) => deletePoi(id)}
        />
      )}

      {tab === "advisories" && (
        <CrudTable<AdvisoryRecord>
          rows={advisories}
          columns={ADVISORY_COLUMNS}
          title="Tagesaktuelle Hinweise"
          searchKeys={["message_de"]}
          onUpsert={(row) => upsertAdvisory(row)}
          onDelete={(id) => deleteAdvisory(id)}
        />
      )}

      {tab === "help" && <HelpRequestsTable rows={helpRequests} />}
    </div>
  );
}

function HelpRequestsTable({ rows }: { rows: HelpRequestRecord[] }) {
  const router = useRouter();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">Hilferufe</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">Datum</th>
                <th className="text-left font-medium px-3 py-2">Typ</th>
                <th className="text-left font-medium px-3 py-2">Name</th>
                <th className="text-left font-medium px-3 py-2">Telefon</th>
                <th className="text-left font-medium px-3 py-2">Position</th>
                <th className="text-left font-medium px-3 py-2">Nachricht</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-right font-medium px-3 py-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    Keine Hilferufe
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {HELP_REQUEST_TYPE_LABELS_DE[r.request_type]}
                    </td>
                    <td className="px-3 py-2">{r.user_name ?? "—"}</td>
                    <td className="px-3 py-2">{r.contact_phone ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {r.lat != null && r.lon != null
                        ? `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate" title={r.message_de ?? ""}>
                      {r.message_de ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          r.status === "open"
                            ? "destructive"
                            : r.status === "resolved"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {HELP_REQUEST_STATUS_LABELS_DE[r.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {r.status !== "responded" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const res = await setHelpRequestStatus(
                                r.id,
                                "responded",
                              );
                              if (res.success) {
                                toast({ title: "Reagiert" });
                                router.refresh();
                              }
                            }}
                          >
                            Reagiert
                          </Button>
                        )}
                        {r.status !== "resolved" && (
                          <Button
                            size="sm"
                            onClick={async () => {
                              const res = await setHelpRequestStatus(
                                r.id,
                                "resolved",
                              );
                              if (res.success) {
                                toast({ title: "Gelöst" });
                                router.refresh();
                              }
                            }}
                          >
                            Lösen
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
