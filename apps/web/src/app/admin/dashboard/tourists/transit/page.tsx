import {
  listTransitDepartures,
  listTransitLines,
  listTransitStops,
} from "@/app/actions/tourists-transit";
import { TransitAdminTabs } from "./transit-admin-tabs";

export const dynamic = "force-dynamic";

export default async function TransitAdminPage() {
  const [lines, stops, departures] = await Promise.all([
    listTransitLines(),
    listTransitStops(),
    listTransitDepartures(),
  ]);

  return (
    <TransitAdminTabs lines={lines} stops={stops} departures={departures} />
  );
}
