import { cn } from "@/lib/utils";

interface CardArtProps {
  className?: string;
  variant?: "primary" | "ghost";
}

/**
 * Placeholder Röbel Card visual — gets replaced once the user provides
 * the final card art. Built as a CSS-rendered card so it stays crisp at
 * any size the scroll-driven hero needs.
 */
export function CardArt({ className, variant = "primary" }: CardArtProps) {
  const isGhost = variant === "ghost";
  return (
    <div
      className={cn(
        "relative aspect-[1.586/1] w-full select-none rounded-3xl shadow-2xl",
        "bg-gradient-to-br",
        isGhost
          ? "from-white via-white to-blue-50 ring-1 ring-blue-100/80"
          : "from-[#1c4a91] via-[#00498B] to-[#0d2242]",
        className,
      )}
      style={{
        boxShadow: isGhost
          ? "0 30px 60px -20px rgba(0,73,139,0.18)"
          : "0 30px 60px -20px rgba(0,73,139,0.55)",
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-3xl">
        <div
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{
            background: isGhost
              ? "radial-gradient(circle, #c5d5ea 0%, transparent 70%)"
              : "radial-gradient(circle, #5987c6 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{
            background: isGhost
              ? "radial-gradient(circle, #779dd0 0%, transparent 70%)"
              : "radial-gradient(circle, #3c72bc 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative flex h-full flex-col justify-between p-6 md:p-8">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-[0.2em]",
                isGhost ? "text-blue-700" : "text-blue-100",
              )}
            >
              Röbel
            </span>
            <span
              className={cn(
                "mt-0.5 text-2xl font-semibold tracking-tight md:text-3xl",
                isGhost ? "text-foreground" : "text-white",
              )}
            >
              Card
            </span>
          </div>
          <div
            className={cn(
              "flex h-9 w-12 items-center justify-center rounded-md",
              isGhost ? "bg-blue-100" : "bg-white/15",
            )}
            aria-hidden
          >
            <div
              className={cn(
                "h-1.5 w-8 rounded-full",
                isGhost ? "bg-blue-700" : "bg-white/70",
              )}
            />
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "font-mono text-base tracking-[0.2em] md:text-lg",
                isGhost ? "text-foreground/80" : "text-white/90",
              )}
            >
              •••• 2330
            </span>
            <span
              className={cn(
                "text-[10px] uppercase tracking-widest",
                isGhost ? "text-muted-foreground" : "text-white/60",
              )}
            >
              Lokales Guthaben
            </span>
          </div>
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-[0.18em]",
              isGhost ? "text-blue-700" : "text-blue-100",
            )}
          >
            Müritz
          </span>
        </div>
      </div>
    </div>
  );
}
