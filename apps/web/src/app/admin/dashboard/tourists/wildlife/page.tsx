import {
  listSeasonalEvents,
  listSightings,
  listSpecies,
} from "@/app/actions/tourists-wildlife";
import { WildlifeAdminTabs } from "./wildlife-admin-tabs";

export const dynamic = "force-dynamic";

export default async function WildlifeAdminPage() {
  const [species, seasonalEvents, sightings] = await Promise.all([
    listSpecies(),
    listSeasonalEvents(),
    listSightings(),
  ]);
  return (
    <WildlifeAdminTabs
      species={species}
      seasonalEvents={seasonalEvents}
      sightings={sightings}
    />
  );
}
