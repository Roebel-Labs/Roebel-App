"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Image from "next/image";
import { useActiveAccount } from "thirdweb/react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAccount } from "@/lib/context/AccountContext";
import { isOrgAccount } from "@/types/account";
import { createClient } from "@/lib/supabase/client";
import {
  fetchProposalComments,
  createProposalComment,
  toggleProposalCommentLike,
  deleteProposalComment,
} from "@/app/actions/proposal-comments";
import {
  ImagePlus,
  X,
  Loader2,
  Heart,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import type { ProposalCommentFeedItem } from "@/types/post";

const MAX_CHARS = 500;
const MAX_IMAGES = 4;
const PAGE_SIZE = 10;

type CommentWithLikes = ProposalCommentFeedItem & {
  likes_count: number;
  is_liked: boolean;
};

interface ProposalCommentSectionProps {
  proposalId: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffHrs < 24) return `vor ${diffHrs} Std.`;
  if (diffDays < 7) return `vor ${diffDays} T.`;
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function ProposalCommentSection({ proposalId }: ProposalCommentSectionProps) {
  const account = useActiveAccount();
  const { user } = useUserProfile();
  const { activeAccount } = useAccount();
  const isPostingAsOrg = activeAccount ? isOrgAccount(activeAccount) : false;

  const [comments, setComments] = useState<CommentWithLikes[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const shortAddress = account?.address
    ? `${account.address.slice(0, 4)}...${account.address.slice(-3)}`
    : "";
  const displayName = user?.username || shortAddress;

  const loadPage = useCallback(
    async (pageIndex: number) => {
      setLoading(true);
      const result = await fetchProposalComments(
        proposalId,
        pageIndex,
        account?.address,
        PAGE_SIZE
      );
      setComments((prev) =>
        pageIndex === 0 ? result.data : [...prev, ...result.data]
      );
      setHasMore(result.hasMore);
      setLoading(false);
    },
    [proposalId, account?.address]
  );

  useEffect(() => {
    setPage(0);
    loadPage(0);
  }, [loadPage]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = MAX_IMAGES - imageFiles.length;
    const newFiles = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Maximal ${MAX_IMAGES} Bilder erlaubt`);
    }
    setImageFiles((prev) => [...prev, ...newFiles]);
    for (const file of newFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removeImage = (i: number) => {
    setImageFiles((prev) => prev.filter((_, idx) => idx !== i));
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const uploadToStorage = async (file: File): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Bild darf maximal 5MB groß sein");
      return null;
    }
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `proposal-comments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("images")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (error) {
      toast.error("Upload fehlgeschlagen");
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from("images").getPublicUrl(fileName);
    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!account?.address || !content.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const uploadedUrls: string[] = [];
      for (const file of imageFiles) {
        const url = await uploadToStorage(file);
        if (url) uploadedUrls.push(url);
      }

      startTransition(async () => {
        const result = await createProposalComment({
          proposal_id: proposalId,
          wallet_address: account.address,
          account_id: activeAccount?.id,
          content: content.trim(),
          media_urls: uploadedUrls,
          emoji: emoji,
        });

        if (result.success && result.data) {
          setComments((prev) => [
            { ...result.data!, likes_count: 0, is_liked: false },
            ...prev,
          ]);
          setContent("");
          setImageFiles([]);
          setImagePreviews([]);
          setEmoji(null);
          toast.success("Kommentar veröffentlicht");
        } else {
          toast.error(result.error || "Fehler beim Erstellen des Kommentars");
        }
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLike = async (commentId: string) => {
    if (!account?.address) return;
    const prev = comments.find((c) => c.id === commentId);
    if (!prev) return;
    // Optimistic
    setComments((cs) =>
      cs.map((c) =>
        c.id === commentId
          ? {
              ...c,
              is_liked: !c.is_liked,
              likes_count: c.is_liked ? c.likes_count - 1 : c.likes_count + 1,
            }
          : c
      )
    );
    const result = await toggleProposalCommentLike(commentId, account.address);
    if (!result.success) {
      // Revert
      setComments((cs) =>
        cs.map((c) =>
          c.id === commentId
            ? { ...c, is_liked: prev.is_liked, likes_count: prev.likes_count }
            : c
        )
      );
      toast.error(result.error || "Fehler beim Liken");
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!account?.address) return;
    const result = await deleteProposalComment(commentId, account.address);
    if (result.success) {
      setComments((cs) => cs.filter((c) => c.id !== commentId));
      toast.success("Kommentar gelöscht");
    } else {
      toast.error(result.error || "Fehler beim Löschen");
    }
  };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    loadPage(next);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Kommentare</h2>
      </div>

      {/* Composer */}
      {account ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground flex-shrink-0 overflow-hidden">
              {isPostingAsOrg && activeAccount?.avatar_url ? (
                <Image src={activeAccount.avatar_url} alt="" width={40} height={40} className="object-cover w-full h-full" />
              ) : user?.profile_picture_url ? (
                <Image src={user.profile_picture_url} alt="" width={40} height={40} className="object-cover w-full h-full" />
              ) : (
                displayName.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="flex-1">
              <textarea
                value={content}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) setContent(e.target.value);
                }}
                placeholder="Was denkst du zu diesem Vorschlag?"
                className="w-full resize-none bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 min-h-[64px]"
                rows={2}
                maxLength={MAX_CHARS}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">{content.length}/{MAX_CHARS}</span>
              </div>
            </div>
          </div>

          {imagePreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap pl-13">
              {imagePreviews.map((preview, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                  <Image src={preview} alt="" fill className="object-cover" sizes="64px" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={imageFiles.length >= MAX_IMAGES}
                className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent transition-colors disabled:opacity-50"
                aria-label="Bilder hinzufügen"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-1 ml-1">
                {["👍", "🤔", "❤️", "🚀", "👀"].map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(emoji === e ? null : e)}
                    className={`text-base p-1 rounded-md transition-colors ${
                      emoji === e ? "bg-primary/15" : "hover:bg-accent"
                    }`}
                    aria-label={`Emoji ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting || isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {(isSubmitting || isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              Kommentieren
            </button>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground py-2">
          Verbinde deine Wallet, um zu kommentieren.
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-4 pt-2">
        {loading && comments.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-muted/50 rounded-lg animate-pulse h-20" />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Noch keine Kommentare. Sei der Erste!
          </p>
        ) : (
          comments.map((c) => {
            const isOrg = !!c.author_account_name;
            const cShortAddr = `${c.wallet_address.slice(0, 4)}...${c.wallet_address.slice(-3)}`;
            const cName = isOrg
              ? c.author_account_name!
              : (c.author_username || cShortAddr);
            const cAvatar = isOrg ? c.author_account_avatar_url : c.author_profile_picture_url;
            const isMine = account?.address?.toLowerCase() === c.wallet_address.toLowerCase();
            return (
              <div key={c.id} className="flex items-start gap-3 group">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0 overflow-hidden">
                  {cAvatar ? (
                    <Image src={cAvatar} alt="" width={36} height={36} className="object-cover w-full h-full" />
                  ) : (
                    cName.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="bg-muted rounded-2xl px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{cName}</span>
                      <span className="text-xs text-muted-foreground">
                        · {formatRelativeTime(c.created_at)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 mt-0.5">
                      {c.emoji && <span className="text-base leading-tight flex-shrink-0">{c.emoji}</span>}
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {c.content}
                      </p>
                    </div>
                  </div>

                  {c.media_urls.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2 max-w-md">
                      {c.media_urls.map((url, i) => (
                        <div key={i} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                          <Image src={url} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 220px" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-1 px-2">
                    <button
                      onClick={() => handleToggleLike(c.id)}
                      disabled={!account}
                      className={`flex items-center gap-1 text-xs transition-colors ${
                        c.is_liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"
                      } disabled:opacity-50`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${c.is_liked ? "fill-current" : ""}`} />
                      {c.likes_count > 0 && <span>{c.likes_count}</span>}
                    </button>
                    {isMine && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Löschen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {hasMore && !loading && (
          <button
            onClick={handleLoadMore}
            className="w-full text-center text-sm text-primary hover:underline py-2"
          >
            Mehr laden
          </button>
        )}
      </div>
    </div>
  );
}
