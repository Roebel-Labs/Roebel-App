import {
  listAdvisories,
  listHelpRequests,
  listPois,
} from "@/app/actions/tourists-pois";
import { PoisAdminTabs } from "./pois-admin-tabs";

export const dynamic = "force-dynamic";

export default async function PoisAdminPage() {
  const [pois, advisories, helpRequests] = await Promise.all([
    listPois(),
    listAdvisories(),
    listHelpRequests(),
  ]);

  return (
    <PoisAdminTabs
      pois={pois}
      advisories={advisories}
      helpRequests={helpRequests}
    />
  );
}
