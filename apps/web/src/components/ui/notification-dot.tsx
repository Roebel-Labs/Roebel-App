import { cn } from "@/lib/utils"

interface NotificationDotProps {
  count: number
  showNumber?: boolean
  className?: string
  size?: "sm" | "md"
}

export function NotificationDot({
  count,
  showNumber = false,
  className,
  size = "sm",
}: NotificationDotProps) {
  if (count <= 0) return null

  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-4 w-4 min-w-[16px] text-[10px]",
  }

  if (showNumber && count > 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-red-500 text-white font-medium",
          sizeClasses.md,
          className
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "rounded-full bg-red-500",
        sizeClasses[size],
        className
      )}
    />
  )
}
