import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const spinnerVariants = cva("rounded-full animate-spin", {
  variants: {
    size: {
      xs: "w-3 h-3 border-[1.5px]",
      sm: "w-4 h-4 border-2",
      md: "w-6 h-6 border-2",
      lg: "w-8 h-8 border-[3px]",
      xl: "w-12 h-12 border-[3px]",
    },
    variant: {
      default: "border-muted-foreground/30 border-t-primary",
      primary: "border-primary/30 border-t-primary",
      secondary: "border-muted-foreground/30 border-t-muted-foreground",
      white: "border-white/30 border-t-white",
      dark: "border-foreground/30 border-t-foreground",
      success: "border-success/30 border-t-success",
      destructive: "border-destructive/30 border-t-destructive",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "default",
  },
});

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  /**
   * Optional label for screen readers
   */
  label?: string;
}

/**
 * Spinner component for loading states.
 *
 * @example
 * ```tsx
 * <Spinner />
 * <Spinner size="lg" variant="primary" />
 * <Spinner size="sm" variant="white" />
 * ```
 */
function Spinner({
  className,
  size,
  variant,
  label = "Loading",
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(spinnerVariants({ size, variant }), className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

Spinner.displayName = "Spinner";

export { Spinner, spinnerVariants };
