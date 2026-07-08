"use client";

// Developer API keys + MCP setup — lets Claude Code and other agents publish
// mini apps for this account. Keys are shown ONCE at creation (hash-stored).
import { useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, ErrorState } from "@/components/mini-apps/ui";
import { miniAppWrite, useMiniAppApi } from "@/components/mini-apps/client";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import { timeAgo } from "@/components/admin/muenzen/format";
import type { ApiKeyRow } from "@/lib/miniapp/keys";

export default function ApiKeysPage() {
  const wallet = useWalletAddress();
  const { data, loading, error, refresh } = useMiniAppApi<{ keys: ApiKeyRow[] }>(
    wallet ? "api-keys" : null,
    wallet,
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const base = typeof window !== "undefined" ? window.location.origin : "https://www.roebel.app";

  async function createKey() {
    if (!wallet) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await miniAppWrite<{ key: string }>(
        "api-keys",
        "POST",
        { name: name.trim() || undefined },
        wallet,
      );
      setFreshKey(res.key);
      setName("");
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!wallet || !window.confirm("Diesen API-Key widerrufen? Verbundene Agenten verlieren den Zugriff.")) return;
    setActionError(null);
    try {
      await miniAppWrite("api-keys", "DELETE", { id }, wallet);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="API & MCP"
        description="API-Keys für Claude Code, den Netizen-MCP-Server und eigene Skripte. Ein Key gehört zu deinem Konto — Apps, die damit eingereicht werden, erscheinen unter „Meine Apps“."
      />

      {!wallet ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Verbinde dich, um API-Keys zu verwalten.
        </Card>
      ) : (
        <div className="space-y-4">
          {freshKey ? (
            <Card className="space-y-2 border-success/50 bg-success/5 p-4">
              <p className="text-sm font-semibold">Dein neuer API-Key — jetzt kopieren!</p>
              <p className="text-xs text-muted-foreground">
                Aus Sicherheitsgründen wird er nur dieses eine Mal angezeigt.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-[8px] border border-border bg-background p-2 font-mono text-xs">
                  {freshKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(freshKey)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setFreshKey(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Verstanden, ausblenden
              </button>
            </Card>
          ) : null}

          <Card className="p-4">
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (z. B. „Claude Code Laptop“)"
                maxLength={60}
              />
              <Button onClick={createKey} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="mr-1 h-4 w-4" /> Key erstellen
                  </>
                )}
              </Button>
            </div>
            {actionError ? <p className="mt-2 text-sm text-destructive">{actionError}</p> : null}
          </Card>

          {error ? (
            <ErrorState error={error} onRetry={refresh} />
          ) : loading && !data ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Lädt…</Card>
          ) : (data?.keys ?? []).length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-8 text-center">
              <KeyRound className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Noch kein API-Key. Erstelle einen, um Apps aus Claude Code oder per MCP
                einzureichen.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {(data?.keys ?? []).map((k) => (
                <Card key={k.id} className="flex items-center gap-3 p-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {k.key_prefix}… · erstellt {timeAgo(Date.parse(k.created_at))}
                      {k.last_used_at
                        ? ` · zuletzt genutzt ${timeAgo(Date.parse(k.last_used_at))}`
                        : " · noch nie genutzt"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(k.id)}
                    aria-label={`${k.name} widerrufen`}
                    className="shrink-0 rounded-[8px] p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}

          <Card className="space-y-2 p-4">
            <p className="text-sm font-semibold">MCP-Setup (Claude Code)</p>
            <code className="block overflow-x-auto rounded-[8px] border border-border bg-muted/50 p-2.5 font-mono text-xs">
              {`claude mcp add --transport http netizen ${base}/api/mcp --header "Authorization: Bearer nz_DEIN_KEY"`}
            </code>
            <p className="text-xs text-muted-foreground">
              Mehr in der{" "}
              <Link href="/developers/mini-apps" className="text-primary hover:underline">
                Entwickler-Doku
              </Link>{" "}
              und unter{" "}
              <Link href="/dashboard/mini-apps/import" className="text-primary hover:underline">
                App importieren
              </Link>
              .
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
