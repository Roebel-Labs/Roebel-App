import { redirect } from "next/navigation";

export default async function NachweisLegacyRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contract?: string }>;
}) {
  const { id } = await params;
  const { contract } = await searchParams;
  const qs = contract ? `?contract=${encodeURIComponent(contract)}` : "";
  redirect(`/app/verifizierung/nachweis/${encodeURIComponent(id)}${qs}`);
}
