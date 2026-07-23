"use client";
import { useCallback, useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { confirmMessage } from "@/lib/gemeinschaftskasse/safe-client";
import type { MessageView } from "@/lib/gemeinschaftskasse/constants";
import { approvalLabel } from "@/lib/gemeinschaftskasse/format";
import { HistorySkeleton } from "./skeletons";
import { useIsOwner } from "./useIsOwner";
import { initials } from "./MemberRow";

export function Anfragen() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { isOwner } = useIsOwner();

  const [items, setItems] = useState<MessageView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/gemeinschaftskasse/messages")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setItems(d.items ?? []);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!items) return <HistorySkeleton />;
  if (!items.length) return <p className="text-sm text-muted-foreground">Keine offenen Anfragen.</p>;

  return (
    <ul className="divide-y divide-border">
      {items.map((m) => (
        <AnfragenCard
          key={m.messageHash}
          message={m}
          isOwner={isOwner}
          connectedAddress={account?.address}
          onConfirm={async () => {
            if (!account) return;
            await confirmMessage({ messageHash: m.messageHash, account, wallet: wallet ?? undefined });
            load();
          }}
        />
      ))}
    </ul>
  );
}

function AnfragenCard({
  message,
  isOwner,
  connectedAddress,
  onConfirm,
}: {
  message: MessageView;
  isOwner: boolean;
  connectedAddress?: string;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userSigned =
    !!connectedAddress &&
    message.signers.some(
      (s) => s.address.toLowerCase() === connectedAddress.toLowerCase(),
    );

  async function handleFreigeben() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">{message.app}</p>
          <p className="text-sm text-muted-foreground">„{message.text}“</p>
          <p className="text-xs text-muted-foreground">
            {approvalLabel(message.confirmations, message.required)}
          </p>
          {message.date && (
            <p className="text-xs text-muted-foreground">
              {new Date(message.date).toLocaleDateString("de-DE")}
            </p>
          )}
          {message.signers.length > 0 && (
            <span className="flex -space-x-1.5 mt-1">
              {message.signers.slice(0, 5).map((s) => (
                <Avatar key={s.address} className="h-6 w-6 border border-background">
                  {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                  <AvatarFallback className="text-[9px]">{initials(s.name)}</AvatarFallback>
                </Avatar>
              ))}
            </span>
          )}
        </div>

        <div className="shrink-0 text-right space-y-1">
          {message.fullySigned ? (
            <span className="text-xs font-medium text-emerald-700">Fertig signiert</span>
          ) : isOwner && userSigned ? (
            <span className="text-xs text-emerald-700">Von dir freigegeben</span>
          ) : isOwner && !userSigned ? (
            <button
              onClick={handleFreigeben}
              disabled={busy}
              className="rounded-md border border-[#00498B] px-3 py-1.5 text-xs font-semibold text-[#00498B] transition-colors hover:bg-[#00498B] hover:text-white disabled:opacity-50"
            >
              {busy ? "Wird freigegeben …" : "Freigeben"}
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600">Fehler: {error}</p>
      )}
    </li>
  );
}
