"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import Image from "next/image";
import { useActiveAccount } from "thirdweb/react";
import {
  getExperiences,
  createExperience,
  deleteExperience,
} from "@/app/actions/experiences";
import { PostMediaGrid } from "@/components/app/PostMediaGrid";
import { VideoPlayer } from "@/components/app/VideoPlayer";
import { MediaLightbox } from "@/components/app/MediaLightbox";
import type { EventExperience } from "@/types/event-experience";
import { Send, ImagePlus, Video, X, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadResumable } from "@/lib/storage/resumable-upload";

const CURATED_EMOJIS = ["😍", "🎉", "😂", "👍", "🤩", "❤️", "🙏", "🌟"];
const MAX_IMAGES = 4;
const PAGE_SIZE = 15;
const MAX_AUTO_PAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (matches bucket cap)

interface ExperienceSectionProps {
  eventId: string;
  initialExperiences: EventExperience[];
  initialCount: number;
  highlightExperienceId?: string;
}

// ============================================
// Helpers
// ============================================

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

async function uploadToStorage(
  file: File,
  type: "image" | "video",
  onVideoProgress?: (pct: number) => void
): Promise<string | null> {
  const maxSize = type === "video" ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    toast.error(
      type === "video"
        ? "Video darf maximal 5 GB groß sein"
        : "Bild darf maximal 5MB groß sein"
    );
    return null;
  }

  const fileExt =
    file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg");
  const prefix =
    type === "video" ? "experience-videos" : "experience-images";
  const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  if (type === "video") {
    try {
      onVideoProgress?.(0);
      const url = await uploadResumable({
        file,
        bucket: "images",
        path: fileName,
        contentType: file.type || "video/mp4",
        onProgress: (pct) => onVideoProgress?.(pct),
      });
      return url;
    } catch (err) {
      console.error("Resumable upload error:", err);
      toast.error("Video-Upload fehlgeschlagen. Bitte versuche es erneut.");
      return null;
    }
  }

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from("images")
    .upload(fileName, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    toast.error("Upload fehlgeschlagen. Bitte versuche es erneut.");
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("images").getPublicUrl(fileName);
  return publicUrl;
}

// ============================================
// ExperienceItem
// ============================================

function ExperienceItem({
  experience,
  currentWallet,
  onDelete,
  isHighlighted,
}: {
  experience: EventExperience;
  currentWallet?: string;
  onDelete: (id: string) => void;
  isHighlighted?: boolean;
}) {
  const shortAddress = `${experience.wallet_address.slice(0, 4)}...${experience.wallet_address.slice(-3)}`;
  const isAuthor =
    currentWallet &&
    experience.wallet_address.toLowerCase() === currentWallet.toLowerCase();

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  return (
    <div
      data-experience-id={experience.id}
      className={`rounded-lg border bg-card p-4 transition-colors duration-700 ${
        isHighlighted
          ? "ring-2 ring-primary border-primary bg-primary/5"
          : "border-border"
      }`}
    >
      {experience.emoji && (
        <div className="text-3xl mb-2">{experience.emoji}</div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
            {experience.author_profile_picture_url ? (
              <Image
                src={experience.author_profile_picture_url}
                alt=""
                width={28}
                height={28}
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                {(experience.author_username || shortAddress)
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {experience.author_username || shortAddress}
            </span>
            <span className="text-xs text-muted-foreground">
              · {formatRelativeTime(experience.created_at)}
            </span>
          </div>
        </div>

        {isAuthor && (
          <button
            onClick={() => onDelete(experience.id)}
            className="p-1.5 text-muted-foreground hover:text-destructive rounded-full hover:bg-destructive/10 transition-colors"
            aria-label="Erlebnis löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
        {experience.content}
      </p>

      {experience.media_urls && experience.media_urls.length > 0 && (
        <div className="mt-3 rounded-lg overflow-hidden">
          <PostMediaGrid
            mediaUrls={experience.media_urls}
            onImageClick={(index) => {
              setLightboxIndex(index);
              setLightboxOpen(true);
            }}
          />
        </div>
      )}

      {experience.video_url && (
        <div className="mt-3 rounded-lg overflow-hidden max-h-64">
          <VideoPlayer url={experience.video_url} />
        </div>
      )}

      <MediaLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        mediaUrls={experience.media_urls}
        videoUrl={experience.video_url}
        initialIndex={lightboxIndex}
        mode="image"
      />
    </div>
  );
}

// ============================================
// ExperienceComposer
// ============================================

function ExperienceComposer({
  eventId,
  onCreated,
}: {
  eventId: string;
  onCreated: (experience: EventExperience) => void;
}) {
  const account = useActiveAccount();
  const [content, setContent] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const hasMedia = imageFiles.length > 0 || videoFile !== null;
  const canSubmit =
    account?.address && (content.trim() || hasMedia) && !isPending && !isUploading;

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

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_VIDEO_SIZE) {
      toast.error("Video darf maximal 5 GB groß sein");
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
  };

  const resetForm = () => {
    setContent("");
    setSelectedEmoji(null);
    setImageFiles([]);
    setImagePreviews([]);
    removeVideo();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const submitContent = content.trim() || " ";
    setIsUploading(true);

    try {
      // Upload media
      const uploadedImageUrls: string[] = [];
      for (const file of imageFiles) {
        const url = await uploadToStorage(file, "image");
        if (url) uploadedImageUrls.push(url);
      }

      let uploadedVideoUrl: string | null = null;
      if (videoFile) {
        try {
          uploadedVideoUrl = await uploadToStorage(videoFile, "video", (pct) =>
            setVideoUploadProgress(pct)
          );
        } finally {
          setVideoUploadProgress(null);
        }
        // Abort experience submit if video upload failed (toast already shown).
        if (!uploadedVideoUrl) {
          setIsUploading(false);
          return;
        }
      }

      // Optimistic experience
      const optimistic: EventExperience = {
        id: `temp-${Date.now()}`,
        event_id: eventId,
        wallet_address: account!.address,
        content: submitContent,
        media_urls: uploadedImageUrls.length > 0 ? uploadedImageUrls : imagePreviews,
        video_url: uploadedVideoUrl || videoPreview,
        emoji: selectedEmoji,
        status: "published",
        created_at: new Date().toISOString(),
        author_username: null,
        author_profile_picture_url: null,
      };

      onCreated(optimistic);
      resetForm();

      startTransition(async () => {
        const result = await createExperience({
          event_id: eventId,
          wallet_address: account!.address,
          content: submitContent,
          media_urls:
            uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
          video_url: uploadedVideoUrl,
          emoji: selectedEmoji,
        });

        if (result.success && result.data) {
          onCreated(result.data);
        } else {
          toast.error(result.error || "Fehler beim Teilen des Erlebnisses");
        }
      });
    } catch {
      toast.error("Fehler beim Teilen des Erlebnisses");
    } finally {
      setIsUploading(false);
    }
  };

  if (!account) return null;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      {/* Emoji picker */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CURATED_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() =>
              setSelectedEmoji((prev) => (prev === emoji ? null : emoji))
            }
            className={`text-xl p-1.5 rounded-lg transition-colors ${
              selectedEmoji === emoji
                ? "bg-primary/10 ring-2 ring-primary/30"
                : "hover:bg-muted"
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Text input */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Erzähl von deinem Erlebnis..."
        maxLength={500}
        rows={3}
        className="w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground resize-none"
      />
      {content.length > 400 && (
        <p className="text-xs text-muted-foreground text-right">
          {content.length}/500
        </p>
      )}

      {/* Media previews */}
      {hasMedia && (
        <div className="flex gap-2 flex-wrap">
          {imagePreviews.map((preview, i) => (
            <div
              key={i}
              className="relative w-16 h-16 rounded-md overflow-hidden"
            >
              <Image
                src={preview}
                alt={`Vorschau ${i + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                aria-label="Bild entfernen"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {videoPreview && (
            <div className="relative w-24 h-16 rounded-md overflow-hidden bg-black">
              <video
                src={videoPreview}
                className="w-full h-full object-contain"
                controls
                muted
                playsInline
              />
              <button
                type="button"
                onClick={removeVideo}
                className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                aria-label="Video entfernen"
              >
                <X className="h-3 w-3" />
              </button>
              {videoUploadProgress != null && (
                <>
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-[10px] font-medium">
                      {videoUploadProgress < 100 ? `${videoUploadProgress}%` : "…"}
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${videoUploadProgress}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={imageFiles.length >= MAX_IMAGES}
            className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Bilder hinzufügen"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={!!videoFile}
            className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Video hinzufügen"
          >
            <Video className="h-4 w-4" />
          </button>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-3.5 w-3.5" />
          Teilen
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleImageSelect}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleVideoSelect}
      />
    </form>
  );
}

// ============================================
// ExperienceSection (Main Export)
// ============================================

export function ExperienceSection({
  eventId,
  initialExperiences,
  initialCount,
  highlightExperienceId,
}: ExperienceSectionProps) {
  const account = useActiveAccount();
  const [experiences, setExperiences] =
    useState<EventExperience[]>(initialExperiences);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialCount > initialExperiences.length);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoPaginatedRef = useRef(false);

  const handleLoadMore = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    const result = await getExperiences(eventId, PAGE_SIZE, experiences.length);
    if (result.success && result.data) {
      setExperiences((prev) => [...prev, ...result.data!]);
      if (result.data.length < PAGE_SIZE) {
        setHasMore(false);
      }
    }

    setIsLoadingMore(false);
  };

  // Deep-link: scroll to & briefly highlight a specific experience.
  // If the experience isn't on the current page, auto-paginate up to 5x.
  useEffect(() => {
    if (!highlightExperienceId) return;

    const present = experiences.some((e) => e.id === highlightExperienceId);

    if (present) {
      const node = containerRef.current?.querySelector(
        `[data-experience-id="${highlightExperienceId}"]`
      );
      if (node) {
        (node as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      setHighlightedId(highlightExperienceId);
      const timeout = window.setTimeout(() => setHighlightedId(null), 2200);
      return () => window.clearTimeout(timeout);
    }

    // Not present yet — try auto-paginating.
    if (autoPaginatedRef.current) return;
    autoPaginatedRef.current = true;

    let cancelled = false;
    (async () => {
      let offset = experiences.length;
      for (let i = 0; i < MAX_AUTO_PAGES; i++) {
        const result = await getExperiences(eventId, PAGE_SIZE, offset);
        if (cancelled) return;
        if (!result.success || !result.data || result.data.length === 0) break;
        const fetched = result.data;
        setExperiences((prev) => [...prev, ...fetched]);
        if (fetched.length < PAGE_SIZE) setHasMore(false);
        offset += fetched.length;
        if (fetched.some((e) => e.id === highlightExperienceId)) break;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightExperienceId, experiences]);

  const handleCreated = (experience: EventExperience) => {
    setExperiences((prev) => {
      // Replace optimistic entry if server response arrived
      const tempIdx = prev.findIndex((e) => e.id.startsWith("temp-"));
      if (tempIdx !== -1 && !experience.id.startsWith("temp-")) {
        const updated = [...prev];
        updated[tempIdx] = experience;
        return updated;
      }
      // Add optimistic entry at the top
      return [experience, ...prev];
    });
    setTotalCount((prev) => {
      // Only increment for optimistic (temp) entries
      if (experience.id.startsWith("temp-")) return prev + 1;
      return prev;
    });
  };

  const handleDelete = async (experienceId: string) => {
    if (!account?.address) return;

    // Optimistic remove
    setExperiences((prev) => prev.filter((e) => e.id !== experienceId));
    setTotalCount((prev) => prev - 1);

    const result = await deleteExperience(experienceId, account.address);
    if (!result.success) {
      toast.error(result.error || "Fehler beim Löschen");
      // Reload to restore state
      const reload = await getExperiences(eventId, PAGE_SIZE, 0);
      if (reload.success && reload.data) {
        setExperiences(reload.data);
      }
    }
  };

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-medium text-foreground">
          Erlebnisse{totalCount > 0 ? ` (${totalCount})` : ""}
        </h2>
      </div>

      {/* Composer */}
      <ExperienceComposer eventId={eventId} onCreated={handleCreated} />

      {/* Experience list */}
      {experiences.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Noch keine Erlebnisse — sei der Erste!
        </p>
      ) : (
        <div className="space-y-3">
          {experiences.map((experience) => (
            <ExperienceItem
              key={experience.id}
              experience={experience}
              currentWallet={account?.address}
              onDelete={handleDelete}
              isHighlighted={experience.id === highlightedId}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={isLoadingMore}
          className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isLoadingMore ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Laden...
            </span>
          ) : (
            "Mehr laden"
          )}
        </button>
      )}
    </div>
  );
}
