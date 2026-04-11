import {
  listRoebelCardPurchases,
  listVereineContributions,
} from "@/app/actions/roebel-card-admin";
import type { RoebelCardPurchaseStatus } from "@/types/roebel-card-voucher";
import { PurchasesTable } from "./purchases-table";

export const dynamic = "force-dynamic";

interface SearchParams {
  page?: string;
  status?: RoebelCardPurchaseStatus | "all";
  beneficiary?: string;
  wallet?: string;
  from?: string;
  to?: string;
}

export default async function RoebelCardPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = 50;

  const [result, contributions] = await Promise.all([
    listRoebelCardPurchases(
      {
        status: sp.status ?? "all",
        beneficiaryAccountId: sp.beneficiary ?? "all",
        walletSearch: sp.wallet,
        from: sp.from,
        to: sp.to,
      },
      page,
      pageSize,
    ),
    listVereineContributions(),
  ]);

  const vereineOptions = contributions.map((c) => ({
    id: c.beneficiary_account_id,
    name: c.account_name,
  }));

  return (
    <PurchasesTable
      purchases={result.purchases}
      totalCount={result.totalCount}
      page={result.page}
      pageSize={result.pageSize}
      vereineOptions={vereineOptions}
      initialFilters={{
        status: sp.status ?? "all",
        beneficiaryAccountId: sp.beneficiary ?? "all",
        walletSearch: sp.wallet ?? "",
        from: sp.from ?? "",
        to: sp.to ?? "",
      }}
    />
  );
}
