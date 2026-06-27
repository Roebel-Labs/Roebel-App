import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Thin redirect so shared Expo deep-links / account UUIDs resolve to the
 * slug-based public org page on web.
 */
export default async function AccountByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("slug, account_type")
    .eq("id", id)
    .maybeSingle();

  if (!data || data.account_type !== "organisation" || !data.slug) notFound();
  redirect(`/app/orgs/${data.slug}`);
}
