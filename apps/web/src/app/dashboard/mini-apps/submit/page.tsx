"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/mini-apps/ui";
import { ManifestForm } from "@/components/mini-apps/ManifestForm";
import { miniAppWrite } from "@/components/mini-apps/client";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import type { MiniAppManifest, MiniAppRow } from "@/lib/miniapp/types";

export default function SubmitMiniApp() {
  const router = useRouter();
  const wallet = useWalletAddress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(manifest: MiniAppManifest) {
    if (!wallet) {
      setError("Bitte verbinde dich zuerst.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { app } = await miniAppWrite<{ app: MiniAppRow }>(
        "submit",
        "POST",
        { manifest, wallet },
        wallet,
      );
      router.push(`/dashboard/mini-apps/${app.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Mini App einreichen"
        description="Reiche eine bereits gehostete Web-App als Mini App ein. Nach dem Absenden landet sie in der Admin-Prüfung."
      />
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}
      <Card className="p-5">
        <ManifestForm submitLabel="Zur Prüfung einreichen" onSubmit={submit} busy={busy} />
      </Card>
    </div>
  );
}
