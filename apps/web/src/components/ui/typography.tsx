import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// =============================================================================
// HEADING COMPONENT
// =============================================================================

const headingVariants = cva("text-foreground", {
  variants: {
    level: {
      h1: "text-3xl font-bold tracking-tight font-heading",
      h2: "text-2xl font-bold tracking-tight font-heading",
      h3: "text-xl font-semibold tracking-tight font-heading",
      h4: "text-lg font-semibold font-heading",
    },
  },
  defaultVariants: {
    level: "h2",
  },
});

type HeadingLevel = "h1" | "h2" | "h3" | "h4";

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  /**
   * The semantic heading level (h1-h4)
   */
  as?: HeadingLevel;
}

/**
 * Heading component with consistent typography.
 *
 * @example
 * ```tsx
 * <Heading level="h1">Page Title</Heading>
 * <Heading level="h2" as="h3">Section heading rendered as h3</Heading>
 * ```
 */
function Heading({
  className,
  level = "h2",
  as,
  children,
  ...props
}: HeadingProps) {
  const Component = as || level || "h2";

  return (
    <Component
      className={cn(headingVariants({ level }), className)}
      {...props}
    >
      {children}
    </Component>
  );
}

Heading.displayName = "Heading";

// =============================================================================
// TEXT COMPONENT
// =============================================================================

const textVariants = cva("", {
  variants: {
    variant: {
      body: "text-sm text-foreground",
      bodyLarge: "text-base text-foreground leading-relaxed",
      small: "text-xs text-foreground",
      muted: "text-sm text-muted-foreground",
      mutedSmall: "text-xs text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

export interface TextProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof textVariants> {
  /**
   * Render as a different element (default: p)
   */
  as?: "p" | "span" | "div";
}

/**
 * Text component for body text with consistent styling.
 *
 * @example
 * ```tsx
 * <Text>Default body text</Text>
 * <Text variant="muted">Subdued description text</Text>
 * <Text variant="bodyLarge">Larger body text</Text>
 * ```
 */
function Text({
  className,
  variant,
  as: Component = "p",
  children,
  ...props
}: TextProps) {
  return (
    <Component className={cn(textVariants({ variant }), className)} {...props}>
      {children}
    </Component>
  );
}

Text.displayName = "Text";

// =============================================================================
// LABEL COMPONENT
// =============================================================================

const labelVariants = cva("text-sm font-medium text-foreground", {
  variants: {
    required: {
      true: "after:content-['*'] after:ml-0.5 after:text-destructive",
      false: "",
    },
  },
  defaultVariants: {
    required: false,
  },
});

export interface LabelTextProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {}

/**
 * Label component for form fields.
 *
 * @example
 * ```tsx
 * <LabelText>Email</LabelText>
 * <LabelText required>Required field</LabelText>
 * ```
 */
function LabelText({
  className,
  required,
  children,
  ...props
}: LabelTextProps) {
  return (
    <label className={cn(labelVariants({ required }), className)} {...props}>
      {children}
    </label>
  );
}

LabelText.displayName = "LabelText";

// =============================================================================
// CAPTION COMPONENT
// =============================================================================

export interface CaptionProps
  extends React.HTMLAttributes<HTMLSpanElement> {}

/**
 * Caption component for small helper text.
 *
 * @example
 * ```tsx
 * <Caption>Last updated 2 hours ago</Caption>
 * ```
 */
function Caption({ className, children, ...props }: CaptionProps) {
  return (
    <span
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    >
      {children}
    </span>
  );
}

Caption.displayName = "Caption";

// =============================================================================
// HELPER TEXT COMPONENT
// =============================================================================

const helperTextVariants = cva("text-xs", {
  variants: {
    variant: {
      default: "text-muted-foreground",
      error: "text-destructive",
      success: "text-success",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface HelperTextProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof helperTextVariants> {}

/**
 * Helper text component for form field descriptions and errors.
 *
 * @example
 * ```tsx
 * <HelperText>Enter your email address</HelperText>
 * <HelperText variant="error">This field is required</HelperText>
 * ```
 */
function HelperText({
  className,
  variant,
  children,
  ...props
}: HelperTextProps) {
  return (
    <p className={cn(helperTextVariants({ variant }), className)} {...props}>
      {children}
    </p>
  );
}

HelperText.displayName = "HelperText";

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Heading,
  headingVariants,
  Text,
  textVariants,
  LabelText,
  labelVariants,
  Caption,
  HelperText,
  helperTextVariants,
};
