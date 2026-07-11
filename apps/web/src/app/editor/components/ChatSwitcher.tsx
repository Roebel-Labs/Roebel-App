"use client";

// Header chat switcher for /editor: lists the logged-in developer's server-
// side chats (own + invited), opens one (?chat=<id>), starts a fresh chat and
// creates invite links. The active session keeps syncing via chatSync.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  History,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteChat, listChats, requestInvite, type ChatMeta } from "../lib/chatSync";

function timeLabel(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function ChatSwitcher({
  wallet,
  activeChatId,
  onOpenChat,
  onNewChat,
}: {
  wallet: string | null;
  activeChatId: string | null;
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<ChatMeta[] | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !wallet) return;
    let cancelled = false;
    void listChats(wallet).then((list) => {
      if (!cancelled) setChats(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, wallet]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const copyInvite = async (chat: ChatMeta) => {
    if (!wallet) return;
    setInviteBusy(chat.id);
    const token = chat.share_token ?? (await requestInvite(chat.id, wallet));
    setInviteBusy(null);
    if (!token) {
      toast.error("Einladung konnte nicht erstellt werden.");
      return;
    }
    const url = `${window.location.origin}/editor?chat=${chat.id}&invite=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Einladungslink kopiert — wer ihn öffnet, baut in diesem Chat mit.");
    } catch {
      window.prompt("Einladungslink kopieren:", url);
    }
    setChats((prev) =>
      (prev ?? []).map((c) => (c.id === chat.id ? { ...c, share_token: token } : c)),
    );
  };

  if (!wallet) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Chat-Verlauf"
      >
        <History className="h-3.5 w-3.5" />
        Chats
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-[10px] border border-border bg-card p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNewChat();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Neuer Chat
          </button>
          <div className="my-1 h-px bg-border" />
          {chats === null ? (
            <div className="flex items-center gap-1.5 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Chats werden geladen…
            </div>
          ) : chats.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Noch keine gespeicherten Chats — sie erscheinen hier automatisch beim Bauen.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
                    chat.id === activeChatId && "bg-accent/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenChat(chat.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {chat.title || chat.app_slug || "Ohne Titel"}
                        {chat.shared && (
                          <Users className="ml-1 inline h-3 w-3 text-muted-foreground" />
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {chat.preview || "—"} · {timeLabel(chat.updated_at)}
                      </span>
                    </span>
                    {chat.id === activeChatId && (
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#00498B]" />
                    )}
                  </button>
                  {!chat.shared && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Einladungslink kopieren"
                        onClick={() => void copyInvite(chat)}
                        className="rounded p-1 text-muted-foreground hover:bg-background"
                      >
                        {inviteBusy === chat.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <LinkIcon className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Chat löschen"
                        onClick={async () => {
                          if (!window.confirm("Diesen Chat wirklich löschen?")) return;
                          const ok = await deleteChat(chat.id, wallet);
                          if (ok) {
                            setChats((prev) => (prev ?? []).filter((c) => c.id !== chat.id));
                            toast.success("Chat gelöscht.");
                          } else toast.error("Löschen fehlgeschlagen.");
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
