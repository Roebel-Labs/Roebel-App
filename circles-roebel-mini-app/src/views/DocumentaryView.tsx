// Video Documentary — the "Build in Public" film series, minted as Zora content
// coins. A list of episodes (thumbnail + metadata) opening into a per-video detail
// page with a custom in-app player that streams the original mp4 from IPFS.
// Owns its own nested navigation (list ↔ detail) so the back button is contextual.
import { useEffect, useState } from "react";
import { DOCUMENTARY_VIDEOS, videoUrl, CREATOR_ADDRESS, type DocVideo } from "../lib/documentary";
import { track } from "../lib/analytics";
import { PageHeader, Avatar } from "../components/ui";
import { ChevronLeft, ChevronRight, Play, ArrowUpRight, Users, Film } from "../components/icons";

const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

export default function DocumentaryView({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);

  const open = (i: number) => {
    const v = DOCUMENTARY_VIDEOS[i];
    setSelected(i);
    track("documentary_video_view", { episode: v.episode, title: v.title, address: v.address });
    // Jump back to the top of the scroll container when entering a detail.
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  if (selected != null) {
    return (
      <VideoDetail
        video={DOCUMENTARY_VIDEOS[selected]}
        index={selected}
        total={DOCUMENTARY_VIDEOS.length}
        onBackToList={() => setSelected(null)}
        onOpen={open}
      />
    );
  }

  return <VideoList onBack={onBack} onOpen={open} />;
}

/* ── List ────────────────────────────────────────────────────────────────────── */
function VideoList({ onBack, onOpen }: { onBack: () => void; onOpen: (i: number) => void }) {
  return (
    <div className="space-y-4">
      <BackButton label="Town" onClick={onBack} />
      <PageHeader
        title="Video Documentary"
        description="Follow the build, episode by episode — short films from the making of the Röbel app, minted onchain on Zora."
      />

      <div className="space-y-3.5">
        {DOCUMENTARY_VIDEOS.map((v, i) => (
          <VideoCard key={v.address} video={v} onClick={() => onOpen(i)} />
        ))}
      </div>
    </div>
  );
}

function VideoCard({ video: v, onClick }: { video: DocVideo; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group block w-full overflow-hidden rounded-[12px] border border-border bg-card text-left shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <img
          src={v.thumb}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          Ep {v.episode}
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[#00498B] shadow-lg ring-1 ring-black/5 transition group-hover:scale-110">
            <Play className="h-5 w-5 translate-x-[1px]" />
          </span>
        </span>
      </div>
      <div className="p-3.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{v.title}</h3>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{fmtDate(v.createdAt)}</span>
          <span className="text-border">•</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {v.holders} {v.holders === 1 ? "holder" : "holders"}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ── Detail ──────────────────────────────────────────────────────────────────── */
function VideoDetail({
  video: v,
  index,
  total,
  onBackToList,
  onOpen,
}: {
  video: DocVideo;
  index: number;
  total: number;
  onBackToList: () => void;
  onOpen: (i: number) => void;
}) {
  // Reset scroll whenever the displayed episode changes (prev/next within detail).
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [v.address]);

  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  return (
    <div className="space-y-4">
      <BackButton label="Video Documentary" onClick={onBackToList} />

      {/* Custom in-app player — streams the source mp4 from IPFS. `key` forces a
          fresh load (and re-applies the poster) when switching episodes. */}
      <div className="overflow-hidden rounded-[12px] border border-border bg-black shadow-sm">
        <video
          key={v.address}
          src={videoUrl(v.videoCid)}
          poster={v.poster}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#00498B]/10 px-2 py-0.5 text-[#00498B]">
            <Film className="h-3 w-3" />
            Episode {v.episode}
          </span>
          <span>{fmtDate(v.createdAt)}</span>
        </div>
        <h2 className="font-display text-xl font-bold leading-tight text-foreground">{v.title}</h2>
      </div>

      {/* Creator */}
      <div className="flex items-center gap-2.5">
        <Avatar address={CREATOR_ADDRESS} name={v.creatorHandle} imageUrl={v.creatorAvatar} size={32} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {v.creatorHandle ? `@${v.creatorHandle}` : "Creator"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {v.holders} {v.holders === 1 ? "collector" : "collectors"}
          </div>
        </div>
      </div>

      {/* Description (falls back gracefully when empty) */}
      {v.description ? (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{v.description}</p>
      ) : (
        <p className="text-[13px] italic leading-relaxed text-muted-foreground">
          A short episode from the build of the Röbel app.
        </p>
      )}

      {/* View on Zora */}
      <a
        href={v.zoraUrl}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#00498B] bg-[#00498B]/5 px-4 py-3 text-[13px] font-semibold text-[#00498B] transition hover:bg-[#00498B]/10 active:scale-[0.99]"
      >
        Collect / view on Zora
        <ArrowUpRight className="h-4 w-4" />
      </a>

      {/* Prev / next episode */}
      <div className="grid grid-cols-2 gap-2.5 border-t border-border/70 pt-4">
        <EpisodeNavButton
          dir="prev"
          video={hasPrev ? DOCUMENTARY_VIDEOS[index - 1] : null}
          onClick={() => hasPrev && onOpen(index - 1)}
        />
        <EpisodeNavButton
          dir="next"
          video={hasNext ? DOCUMENTARY_VIDEOS[index + 1] : null}
          onClick={() => hasNext && onOpen(index + 1)}
        />
      </div>
    </div>
  );
}

function EpisodeNavButton({ dir, video, onClick }: { dir: "prev" | "next"; video: DocVideo | null; onClick: () => void }) {
  const isNext = dir === "next";
  return (
    <button
      onClick={onClick}
      disabled={!video}
      className={`flex items-center gap-2 rounded-[10px] border border-border bg-card p-2.5 text-left shadow-sm transition enabled:hover:bg-muted enabled:active:scale-[0.99] disabled:opacity-40 ${
        isNext ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
        {isNext ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {isNext ? "Next" : "Previous"}
        </span>
        <span className="block truncate text-xs font-semibold text-foreground">
          {video ? `Ep ${video.episode}` : "—"}
        </span>
      </span>
    </button>
  );
}

/* ── Shared back affordance (mirrors App.tsx's SubPage chrome) ─────────────────── */
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="-ml-1.5 inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 text-[13px] font-medium text-muted-foreground transition hover:text-foreground active:scale-[0.98]"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
