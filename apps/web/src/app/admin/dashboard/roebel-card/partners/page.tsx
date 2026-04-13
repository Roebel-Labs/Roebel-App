import { listRoebelCardPartners } from "@/app/actions/roebel-card-admin";
import { PartnersTable } from "./partners-table";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const partners = await listRoebelCardPartners();

  return <PartnersTable initialPartners={partners} />;
}
