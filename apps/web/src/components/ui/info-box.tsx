import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const infoBoxVariants = cva(
  "rounded-lg border p-4 flex gap-3",
  {
    variants: {
      variant: {
        info: "bg-info/10 border-info/30 text-info",
        success: "bg-success/10 border-success/30 text-success",
        warning: "bg-warning/10 border-warning/30 text-warning",
        error: "bg-destructive/10 border-destructive/30 text-destructive",
        muted: "bg-muted border-border text-muted-foreground",
      },
      size: {
        sm: "p-3 text-xs",
        md: "p-4 text-sm",
        lg: "p-5 text-base",
      },
    },
    defaultVariants: {
      variant: "info",
      size: "md",
    },
  }
);

const iconMap: Record<string, LucideIcon> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  muted: Info,
};

export interface InfoBoxProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof infoBoxVariants> {
  /**
   * Optional title for the info box
   */
  title?: string;
  /**
   * Whether to show the icon (default: true)
   */
  showIcon?: boolean;
  /**
   * Custom icon to display instead of the default
   */
  icon?: LucideIcon;
}

/**
 * InfoBox component for displaying informational messages, alerts, and status updates.
 *
 * @example
 * ```tsx
 * <InfoBox variant="info">This is an informational message.</InfoBox>
 * <InfoBox variant="success" title="Success!">Your changes have been saved.</InfoBox>
 * <InfoBox variant="warning">Please review your input.</InfoBox>
 * <InfoBox variant="error">An error occurred. Please try again.</InfoBox>
 * ```
 */
function InfoBox({
  className,
  variant = "info",
  size,
  title,
  showIcon = true,
  icon,
  children,
  ...props
}: InfoBoxProps) {
  const IconComponent = icon || iconMap[variant || "info"];
  const iconSize = size === "sm" ? 16 : size === "lg" ? 24 : 20;

  return (
    <div
      role="alert"
      className={cn(infoBoxVariants({ variant, size }), className)}
      {...props}
    >
      {showIcon && (
        <IconComponent
          className="flex-shrink-0 mt-0.5"
          size={iconSize}
        />
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-medium mb-1">{title}</p>
        )}
        <div className={title ? "opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}

InfoBox.displayName = "InfoBox";

// =============================================================================
// INFO BOX VARIANTS FOR SPECIFIC USE CASES
// =============================================================================

export interface SimpleInfoBoxProps extends Omit<InfoBoxProps, "variant"> {}

/**
 * Convenience components for specific info box types.
 */
function InfoBoxInfo(props: SimpleInfoBoxProps) {
  return <InfoBox variant="info" {...props} />;
}

function InfoBoxSuccess(props: SimpleInfoBoxProps) {
  return <InfoBox variant="success" {...props} />;
}

function InfoBoxWarning(props: SimpleInfoBoxProps) {
  return <InfoBox variant="warning" {...props} />;
}

function InfoBoxError(props: SimpleInfoBoxProps) {
  return <InfoBox variant="error" {...props} />;
}

InfoBoxInfo.displayName = "InfoBoxInfo";
InfoBoxSuccess.displayName = "InfoBoxSuccess";
InfoBoxWarning.displayName = "InfoBoxWarning";
InfoBoxError.displayName = "InfoBoxError";

export {
  InfoBox,
  infoBoxVariants,
  InfoBoxInfo,
  InfoBoxSuccess,
  InfoBoxWarning,
  InfoBoxError,
};
