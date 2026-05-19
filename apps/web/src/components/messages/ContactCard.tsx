"use client";

interface ContactCardProps {
  name: string;
  profilePictureUrl: string | null;
  fallbackLabel?: string | null;
  lastMessage?: string | null;
  lastMessageTime?: Date | null;
  isCitizen?: boolean;
  unreadCount?: number;
  onClick: () => void;
  isSelected?: boolean;
}

export function ContactCard({
  name,
  profilePictureUrl,
  fallbackLabel,
  lastMessage,
  lastMessageTime,
  isCitizen,
  unreadCount,
  onClick,
  isSelected,
}: ContactCardProps) {
  const displayName = name || fallbackLabel || "Unbekannt";
  const initials = displayName.slice(0, 2).toUpperCase();

  const timeLabel = lastMessageTime
    ? formatMessageTime(lastMessageTime)
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 text-left transition-colors rounded-lg ${
        isSelected ? "bg-muted" : "hover:bg-accent active:bg-muted"
      }`}
    >
      <div className="relative flex-shrink-0">
        {profilePictureUrl ? (
          <img
            src={profilePictureUrl}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground">
              {initials}
            </span>
          </div>
        )}
        {isCitizen && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {displayName}
          </span>
          {timeLabel && (
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {timeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          {lastMessage ? (
            <span className="text-xs text-muted-foreground truncate">
              {lastMessage}
            </span>
          ) : fallbackLabel ? (
            <span className="text-xs text-muted-foreground truncate">
              {fallbackLabel}
            </span>
          ) : null}
          {unreadCount && unreadCount > 0 ? (
            <span className="flex-shrink-0 bg-foreground text-white text-[10px] font-medium rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function formatMessageTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Jetzt";
  if (diffMins < 60) return `${diffMins} Min.`;
  if (diffHours < 24) return `${diffHours} Std.`;
  if (diffDays < 7) return `${diffDays} T.`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
