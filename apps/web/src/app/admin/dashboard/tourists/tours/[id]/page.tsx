import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getTour,
  listTourCompletions,
  listTourStops,
} from "@/app/actions/tourists-tours";
import { listPois } from "@/app/actions/tourists-pois";
import { TourStopsManager } from "./tour-stops-manager";

export const dynamic = "force-dynamic";

export default async function TourDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tour, stops, completions, pois] = await Promise.all([
    getTour(id),
    listTourStops(id),
    listTourCompletions(id),
    listPois(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/dashboard/tourists/tours"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Alle Touren
        </Link>
        <h2 className="text-2xl font-medium">{tour.title_de}</h2>
        <p className="text-sm text-muted-foreground">{tour.slug}</p>
      </div>

      <TourStopsManager tourId={tour.id} stops={stops} pois={pois} />

      <section className="space-y-2">
        <h3 className="text-lg font-medium">Abschlüsse</h3>
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          {completions.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">
              Noch keine Abschlüsse
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2">Datum</th>
                  <th className="text-left font-medium px-3 py-2">Wallet</th>
                  <th className="text-left font-medium px-3 py-2">Notizen</th>
                </tr>
              </thead>
              <tbody>
                {completions.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(c.completed_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {c.user_wallet}
                    </td>
                    <td className="px-3 py-2">{c.notes_de ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
