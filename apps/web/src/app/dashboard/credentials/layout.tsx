"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { credentialsRequest } from "@/lib/credentials/client";
import { OrgGateCard, type OrgGateState } from "@/components/credentials/OrgGateCard";
import { CredentialsContext, type CredentialOrg } from "@/components/credentials/CredentialsContext";

const TABS = [
  { href: "/dashboard/credentials", label: "Übersicht" },
  { href: "/dashboard/credentials/types", label: "Ausweis-Typen" },
  { href: "/dashboard/credentials/people", label: "Personen" },
  { href: "/dashboard/credentials/batches", label: "Ausstellungen" },
  { href: "/dashboard/credentials/settings", label: "Einstellungen" },
];

/**
 * Credential register area of the org dashboard. Reads the active org from the account context,
 * asks orgs_list once (signed with the browser's account) and shows one explanation card instead
 * of the pages unless the org is ready on chain and the caller is owner or admin.
 */
export default function CredentialsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeAccount } = useAccount();
  const signer = useActiveAccount();
  const [status, setStatus] = useState<{ enabled: boolean; configured: boolean } | null>(null);
  const [orgs, setOrgs] = useState<CredentialOrg[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/credentials/status")
      .then((r) => r.json())
      .then((s) => alive && setStatus({ enabled: s?.enabled === true, configured: s?.configured === true }))
      .catch(() => alive && setStatus({ enabled: false, configured: false }));
    return () => {
      alive = false;
    };
  }, []);

  const loadOrgs = useCallback(async () => {
    if (!signer) return;
    const r = await credentialsRequest<CredentialOrg[]>(signer, "org", "orgs_list", {});
    if (r.ok) {
      setOrgs(r.data);
      setError(null);
    } else {
      setError(r.message);
    }
  }, [signer]);

  const ready = status?.enabled === true && status.configured;
  useEffect(() => {
    if (ready && signer && orgs === null) void loadOrgs();
  }, [ready, signer, orgs, loadOrgs]);

  const org = useMemo(() => orgs?.find((o) => o.accountId === activeAccount?.id) ?? null, [orgs, activeAccount?.id]);

  let gate: OrgGateState | "loading" = "loading";
  if (status && !ready) gate = "not_enabled";
  else if (!signer) gate = "signed_out";
  else if (orgs !== null) gate = !org ? "forbidden" : org.onChain;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Ausweise</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Mitgliedsausweise, Ämter und Abzeichen eurer Organisation. Jede Änderung bestätigst du in der Röbel App auf deinem Handy.
        </p>
      </div>
      {gate === "ready" && org && signer ? (
        <>
          <nav className="flex flex-wrap gap-1 border-b border-[#B4B8C1]">
            {TABS.map((t) => {
              const active = t.href === "/dashboard/credentials" ? pathname === t.href : pathname?.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                    active ? "border-[#00498B] font-medium text-[#00498B]" : "border-transparent text-[#6B7280] hover:text-foreground"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <CredentialsContext.Provider value={{ account: signer, org, refreshOrg: loadOrgs }}>{children}</CredentialsContext.Provider>
        </>
      ) : gate === "loading" ? (
        error ? (
          <div className="rounded-lg border border-[#B4B8C1] bg-card p-4 text-sm text-red-600">
            {error}{" "}
            <button type="button" className="ml-2 font-medium text-[#00498B] underline" onClick={() => void loadOrgs()}>
              Erneut versuchen
            </button>
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-lg border border-[#B4B8C1] bg-card" aria-busy />
        )
      ) : (
        <OrgGateCard state={gate} />
      )}
    </div>
  );
}
