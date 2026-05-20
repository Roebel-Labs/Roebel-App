"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "@/lib/context/AccountContext";
import { OpeningHoursEditor } from "@/components/business/OpeningHoursEditor";
import { updateAccountOpeningHours } from "@/app/actions/accounts";
import type { OpeningHours } from "@/types/business";

export default function OrgOpeningHoursPage() {
  const { activeAccount, refreshAccounts } = useAccount();
  const [hours, setHours] = useState<OpeningHours>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHours(activeAccount?.opening_hours ?? {});
  }, [activeAccount?.id, activeAccount?.opening_hours]);

  if (!activeAccount) return null;

  const handleSave = async () => {
    setSaving(true);
    const result = await updateAccountOpeningHours(activeAccount.id, hours);
    if (result.success) {
      toast.success("Öffnungszeiten gespeichert.");
      await refreshAccounts();
    } else {
      toast.error(result.error ?? "Fehler beim Speichern.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-medium">Öffnungszeiten</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Optional — leer lassen, falls deine Organisation keine festen Öffnungszeiten hat.
        </p>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-6">
        <OpeningHoursEditor value={hours} onChange={setHours} />

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
