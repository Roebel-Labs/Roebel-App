import { listTours } from "@/app/actions/tourists-tours";
import { ToursAdminTable } from "./tours-admin-table";

export const dynamic = "force-dynamic";

export default async function ToursAdminPage() {
  const tours = await listTours();
  return <ToursAdminTable tours={tours} />;
}
