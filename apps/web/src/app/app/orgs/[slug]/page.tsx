import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/account";
import { SUB_TYPE_LABELS } from "@/types/account";
import { OrgDetailClient } from "./OrgDetailClient";

export const dynamic = "force-dynamic";

async function getAccount(slug: string): Promise<Account | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Account) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const account = await getAccount(slug);
  if (!account) return { title: "Organisation" };
  const sub = account.sub_type ? SUB_TYPE_LABELS[account.sub_type] : "Organisation";
  return {
    title: `${account.name} · ${sub}`,
    description: account.bio ?? undefined,
  };
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const account = await getAccount(slug);

  if (!account || account.account_type !== "organisation") notFound();
  // Hide extern orgs that are still pending / rejected approval.
  if (account.is_extern && account.extern_status !== "approved") notFound();

  return <OrgDetailClient account={account} />;
}
