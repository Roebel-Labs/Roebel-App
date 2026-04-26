"use client";

import { useMemo } from "react";
import {
  TOUR_STOP_TYPE_LABELS_DE,
  type PoiRecord,
  type TourStopRecord,
} from "@/lib/supabase-tourists";
import { CrudTable } from "../../_components/crud-table";
import type { ColumnDef } from "../../_components/types";
import {
  deleteTourStop,
  upsertTourStop,
} from "@/app/actions/tourists-tours";

interface Props {
  tourId: string;
  stops: TourStopRecord[];
  pois: PoiRecord[];
}

export function TourStopsManager({ tourId, stops, pois }: Props) {
  const poiOptions = useMemo(
    () => pois.map((p) => ({ id: p.id, label: p.name_de })),
    [pois],
  );

  const columns: ColumnDef[] = useMemo(
    () => [
      { key: "stop_order", label: "Reihenfolge", type: "number", required: true },
      { key: "name_de", label: "Name", type: "text", required: true },
      {
        key: "stop_type",
        label: "Typ",
        type: "enum",
        options: Object.entries(TOUR_STOP_TYPE_LABELS_DE).map(
          ([value, label]) => ({ value, label }),
        ),
      },
      { key: "lat", label: "Lat", type: "number", step: 0.000001, hideInList: true },
      { key: "lon", label: "Lon", type: "number", step: 0.000001, hideInList: true },
      { key: "km_from_start", label: "km ab Start", type: "number", step: 0.01 },
      {
        key: "description_de",
        label: "Beschreibung",
        type: "longtext",
        hideInList: true,
      },
      { key: "poi_id", label: "POI", type: "fk", fkOptions: poiOptions, hideInList: true },
    ],
    [poiOptions],
  );

  return (
    <CrudTable<TourStopRecord>
      rows={stops}
      columns={columns}
      title="Tour-Stops"
      searchKeys={["name_de"]}
      defaultRow={
        {
          tour_id: tourId,
          stop_order: stops.length,
        } as Partial<TourStopRecord>
      }
      onUpsert={(row) =>
        upsertTourStop({ ...row, tour_id: tourId } as Partial<TourStopRecord> & {
          tour_id: string;
        })
      }
      onDelete={(id) => deleteTourStop(id, tourId)}
    />
  );
}
