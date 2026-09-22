import { listMapMarkerEntities } from "@/app/actions/map-icons";
import { MapIconsTable } from "./_components/map-icons-table";

export const dynamic = "force-dynamic";

export default async function MapIconsAdminPage() {
  const entities = await listMapMarkerEntities();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Karten-Icons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alles, was auf der Karte in der App einen Pin bekommt. Ohne eigenes Bild zeigt der Pin
          das passende Emoji. Hier kannst du je Pin ein Emoji setzen oder ein eigenes Bild
          hochladen, das rund zugeschnitten als Pin erscheint.
        </p>
      </div>
      <MapIconsTable entities={entities} />
    </div>
  );
}
