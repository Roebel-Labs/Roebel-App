"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TOUR_DIFFICULTY_LABELS_DE,
  TOUR_HOURS_LABELS_DE,
  type TourRecord,
} from "@/lib/supabase-tourists";
import { CrudTable } from "../_components/crud-table";
import type { ColumnDef } from "../_components/types";
import {
  deleteTour,
  setMeckysTipp,
  upsertTour,
} from "@/app/actions/tourists-tours";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TOUR_COLUMNS: ColumnDef[] = [
  { key: "slug", label: "Slug", type: "text", required: true },
  { key: "title_de", label: "Titel", type: "text", required: true },
  { key: "subtitle_de", label: "Untertitel", type: "text", hideInList: true },
  {
    key: "description_de",
    label: "Beschreibung",
    type: "longtext",
    hideInList: true,
  },
  {
    key: "cover_image_url",
    label: "Cover",
    type: "image",
    bucketName: "tour-images",
  },
  { key: "start_label_de", label: "Start", type: "text", hideInList: true },
  {
    key: "start_lat",
    label: "Start Lat",
    type: "number",
    step: 0.000001,
    hideInList: true,
  },
  {
    key: "start_lon",
    label: "Start Lon",
    type: "number",
    step: 0.000001,
    hideInList: true,
  },
  { key: "distance_km", label: "Distanz km", type: "number", step: 0.01 },
  { key: "duration_min", label: "Dauer min", type: "number", hideInList: true },
  {
    key: "elevation_gain_m",
    label: "Höhenmeter",
    type: "number",
    hideInList: true,
  },
  { key: "surface_de", label: "Belag", type: "text", hideInList: true },
  {
    key: "difficulty",
    label: "Schwierigkeit",
    type: "enum",
    required: true,
    options: Object.entries(TOUR_DIFFICULTY_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  {
    key: "hours_bucket",
    label: "Zeit-Bucket",
    type: "enum",
    options: Object.entries(TOUR_HOURS_LABELS_DE).map(([value, label]) => ({
      value,
      label,
    })),
  },
  {
    key: "categories",
    label: "Kategorien",
    type: "csv",
    hint: "z. B. familie, sonnenuntergang, wandern",
    hideInList: true,
  },
  { key: "is_sternfahrt", label: "Sternfahrt", type: "bool" },
  { key: "ferry_combo", label: "Schiff-Kombi", type: "bool", hideInList: true },
  { key: "bus_combo", label: "Bus-Kombi", type: "bool", hideInList: true },
  {
    key: "has_swim_stop",
    label: "Bade-Stopp",
    type: "bool",
    hideInList: true,
  },
  { key: "has_eis_stop", label: "Eis-Stopp", type: "bool", hideInList: true },
  {
    key: "family_friendly",
    label: "Familie",
    type: "bool",
  },
  {
    key: "bad_weather_alternative",
    label: "Schlechtwetter",
    type: "bool",
    hideInList: true,
  },
  { key: "season_de", label: "Saison", type: "text", hideInList: true },
  {
    key: "best_start_time_de",
    label: "Beste Startzeit",
    type: "text",
    hideInList: true,
  },
  {
    key: "return_options_de",
    label: "Rückweg-Optionen",
    type: "longtext",
    hideInList: true,
  },
  { key: "gpx_url", label: "GPX URL", type: "text", hideInList: true },
  { key: "komoot_url", label: "Komoot", type: "text", hideInList: true },
  { key: "alltrails_url", label: "AllTrails", type: "text", hideInList: true },
  {
    key: "highlights_de",
    label: "Highlights",
    type: "json-array",
    hint: "Komma-getrennte Bullet-Punkte",
    hideInList: true,
  },
  {
    key: "warnings_de",
    label: "Warnungen",
    type: "json-array",
    hideInList: true,
  },
  { key: "is_meckys_tipp_today", label: "Mecky's Tipp", type: "bool" },
  { key: "is_active", label: "Aktiv", type: "bool" },
];

export function ToursAdminTable({ tours }: { tours: TourRecord[] }) {
  const router = useRouter();

  return (
    <CrudTable<TourRecord>
      rows={tours}
      columns={TOUR_COLUMNS}
      title="Sternfahrten"
      searchKeys={["title_de", "slug"]}
      defaultRow={
        {
          is_active: true,
          is_sternfahrt: true,
          difficulty: "leicht",
          categories: [],
          highlights_de: [],
          warnings_de: [],
        } as Partial<TourRecord>
      }
      onUpsert={(row) => upsertTour(row)}
      onDelete={(id) => deleteTour(id)}
      rowActions={(row) => (
        <>
          <Button
            size="icon"
            variant="ghost"
            title="Mecky's Tipp setzen"
            onClick={async (e) => {
              e.stopPropagation();
              const res = await setMeckysTipp(row.id);
              if (res.success) {
                toast({ title: "Mecky's Tipp gesetzt" });
                router.refresh();
              }
            }}
          >
            <Star
              className={
                row.is_meckys_tipp_today
                  ? "h-4 w-4 fill-amber-400 text-amber-500"
                  : "h-4 w-4"
              }
            />
          </Button>
          <Button
            size="sm"
            variant="outline"
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={`/admin/dashboard/tourists/tours/${row.id}`}>
              Stops
            </Link>
          </Button>
        </>
      )}
    />
  );
}
