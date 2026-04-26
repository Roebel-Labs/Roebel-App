"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, UserCog, Mail } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { approveExtern, rejectExtern } from "@/app/actions/extern-accounts";
import {
  SUB_TYPE_LABELS,
  SUB_TYPE_EMOJI,
  type OrgSubType,
} from "@/types/account";

interface Row {
  id: string;
  name: string;
  sub_type: OrgSubType | null;
  contact_email: string | null;
  extern_reason: string | null;
  extern_status: "pending" | "approved" | "rejected" | null;
  created_at: string;
}

const REVIEWER = "admin";

export default function ExternAccountsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("accounts")
      .select(
        "id, name, sub_type, contact_email, extern_reason, extern_status, created_at"
      )
      .eq("is_extern", true)
      .order("created_at", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => (r.extern_status ?? "pending") === tab);

  const handleApprove = async (id: string) => {
    const t = toast.loading("Wird freigegeben...");
    const res = await approveExtern(id, REVIEWER);
    if (res.success) {
      toast.success("Freigegeben", { id: t });
      await load();
    } else {
      toast.error("Fehler", { id: t, description: res.error });
    }
  };

  const handleReject = async (id: string, reason: string) => {
    const t = toast.loading("Wird abgelehnt...");
    const res = await rejectExtern(id, REVIEWER, reason);
    if (res.success) {
      toast.success("Abgelehnt", { id: t });
      await load();
    } else {
      toast.error("Fehler", { id: t, description: res.error });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium">Externe Konten</h1>
        <p className="text-muted-foreground mt-1">
          Anträge externer Organisationen prüfen und freigeben.
        </p>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t === "pending"
              ? "Offen"
              : t === "approved"
              ? "Freigegeben"
              : "Abgelehnt"}{" "}
            (
            {rows.filter((r) => (r.extern_status ?? "pending") === t).length})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-[10px]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-[10px]">
          <UserCog className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Keine Einträge in dieser Kategorie.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="bg-card border border-border rounded-[10px] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium">
                      <span aria-hidden className="mr-1">
                        {r.sub_type ? SUB_TYPE_EMOJI[r.sub_type] : "🏢"}
                      </span>
                      {r.name}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {r.sub_type ? SUB_TYPE_LABELS[r.sub_type] : "—"}
                    </Badge>
                  </div>
                  {r.contact_email && (
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      {r.contact_email}
                    </p>
                  )}
                  {r.extern_reason && (
                    <p className="text-sm text-foreground mt-3 whitespace-pre-wrap">
                      {r.extern_reason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Eingereicht{" "}
                    {new Date(r.created_at).toLocaleString("de-DE")}
                  </p>
                </div>
                {(r.extern_status ?? "pending") === "pending" && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(r.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Freigeben
                    </Button>
                    <RejectButton
                      onConfirm={(reason) => handleReject(r.id, reason)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RejectButton({
  onConfirm,
}: {
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <XCircle className="h-4 w-4 mr-1.5" />
          Ablehnen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Antrag ablehnen?</AlertDialogTitle>
          <AlertDialogDescription>
            Der Antragsteller wird per E-Mail benachrichtigt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <textarea
          rows={3}
          placeholder="Grund (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(reason)}>
            Ablehnen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
