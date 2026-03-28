"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Moon, Sun, Monitor, Copy, Check } from "lucide-react";
import { useTheme } from "next-themes";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InfoBox } from "@/components/ui/info-box";
import {
  Heading,
  Text,
  Caption,
  LabelText,
  HelperText,
} from "@/components/ui/typography";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Design Tokens
import { tokens } from "@/lib/design-tokens";

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto">
        <code>{children}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Heading level="h2" className="mb-6 pb-2 border-b border-border">
        {title}
      </Heading>
      {children}
    </section>
  );
}

function ColorSwatch({
  name,
  className,
  textClass,
}: {
  name: string;
  className: string;
  textClass?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`h-16 rounded-lg border border-border ${className}`}
      />
      <Text variant="small" className={textClass}>
        {name}
      </Text>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DesignSystemPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    const order = ["light", "dark", "system"];
    const current = theme || "system";
    const next = order[(order.indexOf(current) + 1) % order.length];
    setTheme(next);
  };

  const ThemeIcon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun;
  const themeLabel = !mounted ? "..." : theme === "system" ? "System" : resolvedTheme === "dark" ? "Dark" : "Light";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back</span>
              </Link>
              <Heading level="h1" className="text-xl">
                Design System
              </Heading>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={cycleTheme}
              className="gap-2"
            >
              <ThemeIcon className="w-4 h-4" />
              {themeLabel}
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-border bg-muted/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-4 overflow-x-auto text-sm">
            {[
              { href: "#darkmode", label: "Dark Mode" },
              { href: "#colors", label: "Colors" },
              { href: "#typography", label: "Typography" },
              { href: "#buttons", label: "Buttons" },
              { href: "#badges", label: "Badges" },
              { href: "#spinners", label: "Spinners" },
              { href: "#infobox", label: "InfoBox" },
              { href: "#cards", label: "Cards" },
              { href: "#forms", label: "Forms" },
              { href: "#tokens", label: "Tokens" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 space-y-16">
        {/* Dark Mode Section */}
        <Section id="darkmode" title="Dark Mode">
          <div className="space-y-8">
            <InfoBox variant="info">
              Dark mode is powered by{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">next-themes</code>
              {" "}with class-based switching. The theme provider is in{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">src/components/ThemeProvider.tsx</code>
              {" "}and CSS variables are defined in{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">globals.css</code>.
              Users can toggle in{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/app/einstellungen</code>.
            </InfoBox>

            {/* Theme Toggle Preview */}
            <div>
              <Heading level="h3" className="mb-4">Theme Toggle</Heading>
              <div className="flex gap-3 p-6 rounded-lg border border-border">
                {[
                  { value: "light", label: "Hell", icon: Sun },
                  { value: "dark", label: "Dunkel", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      theme === value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Icon className={`h-6 w-6 ${theme === value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${theme === value ? "text-primary" : "text-foreground"}`}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Color Palette */}
            <div>
              <Heading level="h3" className="mb-4">Color Palettes</Heading>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 rounded-lg border border-border space-y-3">
                  <Text className="font-medium">Light Mode</Text>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-card border border-border" />
                      <span className="text-muted-foreground">Background: #ffffff</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{background: "#194383"}} />
                      <span className="text-muted-foreground">Primary: #194383</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-black" />
                      <span className="text-muted-foreground">Text: #0a0a0a</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{background: "#737373"}} />
                      <span className="text-muted-foreground">Muted: #737373</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border border-border space-y-3">
                  <Text className="font-medium">Dark Mode</Text>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{background: "#202124"}} />
                      <span className="text-muted-foreground">Background: #202124</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{background: "#8AB4F8"}} />
                      <span className="text-muted-foreground">Primary: #8AB4F8</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{background: "#e8eaed"}} />
                      <span className="text-muted-foreground">Text: #e8eaed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{background: "#9aa0a6"}} />
                      <span className="text-muted-foreground">Muted: #9aa0a6</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock>{`// ThemeProvider wraps the app in layout.tsx
import { ThemeProvider } from "@/components/ThemeProvider";
<ThemeProvider>{children}</ThemeProvider>

// Use useTheme() to read/set theme
import { useTheme } from "next-themes";
const { theme, setTheme, resolvedTheme } = useTheme();

// ConnectButton adapts to theme
<ConnectButton theme={resolvedTheme === "dark" ? "dark" : "light"} />

// NEVER use hardcoded colors — use semantic tokens:
// bg-card, text-foreground, border-border, text-muted-foreground, bg-muted, hover:bg-accent`}</CodeBlock>
          </div>
        </Section>

        {/* Colors Section */}
        <Section id="colors" title="Colors">
          <div className="space-y-8">
            {/* Primary Colors */}
            <div>
              <Heading level="h3" className="mb-4">
                Primary & Semantic
              </Heading>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                <ColorSwatch name="Primary" className="bg-primary" />
                <ColorSwatch name="Secondary" className="bg-secondary" />
                <ColorSwatch name="Muted" className="bg-muted" />
                <ColorSwatch name="Accent" className="bg-accent" />
                <ColorSwatch name="Destructive" className="bg-destructive" />
                <ColorSwatch name="Background" className="bg-background" />
              </div>
            </div>

            {/* Status Colors */}
            <div>
              <Heading level="h3" className="mb-4">
                Status Colors
              </Heading>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <ColorSwatch name="Success" className="bg-success" />
                <ColorSwatch name="Warning" className="bg-warning" />
                <ColorSwatch name="Info" className="bg-info" />
                <ColorSwatch name="Error" className="bg-destructive" />
              </div>
            </div>

            {/* Text Colors */}
            <div>
              <Heading level="h3" className="mb-4">
                Text Colors
              </Heading>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border border-border">
                  <Text className="text-foreground">Foreground</Text>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <Text className="text-muted-foreground">Muted</Text>
                </div>
                <div className="p-4 rounded-lg border border-border bg-primary">
                  <Text className="text-primary-foreground">Primary FG</Text>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <Text className="text-primary">Primary</Text>
                </div>
              </div>
            </div>

            <CodeBlock>{`// Usage
<div className="bg-primary text-primary-foreground" />
<div className="bg-success/10 text-success" />
<p className="text-muted-foreground">Subdued text</p>`}</CodeBlock>
          </div>
        </Section>

        {/* Typography Section */}
        <Section id="typography" title="Typography">
          <div className="space-y-8">
            {/* Headings */}
            <div>
              <Heading level="h3" className="mb-4">
                Headings
              </Heading>
              <div className="space-y-4 p-6 rounded-lg border border-border">
                <Heading level="h1">Heading 1 - Page Title</Heading>
                <Heading level="h2">Heading 2 - Section Title</Heading>
                <Heading level="h3">Heading 3 - Subsection</Heading>
                <Heading level="h4">Heading 4 - Card Title</Heading>
              </div>
            </div>

            {/* Body Text */}
            <div>
              <Heading level="h3" className="mb-4">
                Body Text
              </Heading>
              <div className="space-y-4 p-6 rounded-lg border border-border">
                <Text variant="bodyLarge">
                  Body Large - Used for article content and important paragraphs.
                </Text>
                <Text>Body - Default text size for most content.</Text>
                <Text variant="small">Small - Used for compact UI elements.</Text>
                <Text variant="muted">Muted - Subdued text for descriptions.</Text>
                <Text variant="mutedSmall">Muted Small - Timestamps and metadata.</Text>
              </div>
            </div>

            {/* Labels & Helpers */}
            <div>
              <Heading level="h3" className="mb-4">
                Labels & Helpers
              </Heading>
              <div className="space-y-4 p-6 rounded-lg border border-border">
                <div>
                  <LabelText>Form Label</LabelText>
                </div>
                <div>
                  <LabelText required>Required Label</LabelText>
                </div>
                <Caption>Caption text for timestamps</Caption>
                <HelperText>Helper text for form fields</HelperText>
                <HelperText variant="error">Error message text</HelperText>
                <HelperText variant="success">Success message text</HelperText>
              </div>
            </div>

            <CodeBlock>{`import { Heading, Text, Caption, LabelText, HelperText } from "@/components/ui/typography";

<Heading level="h1">Page Title</Heading>
<Text variant="muted">Description text</Text>
<LabelText required>Email</LabelText>
<HelperText variant="error">This field is required</HelperText>`}</CodeBlock>
          </div>
        </Section>

        {/* Buttons Section */}
        <Section id="buttons" title="Buttons">
          <div className="space-y-8">
            {/* Variants */}
            <div>
              <Heading level="h3" className="mb-4">
                Variants
              </Heading>
              <div className="flex flex-wrap gap-4 p-6 rounded-lg border border-border">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <Heading level="h3" className="mb-4">
                Sizes
              </Heading>
              <div className="flex flex-wrap items-center gap-4 p-6 rounded-lg border border-border">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">
                  <Sun className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* States */}
            <div>
              <Heading level="h3" className="mb-4">
                States
              </Heading>
              <div className="flex flex-wrap gap-4 p-6 rounded-lg border border-border">
                <Button>Normal</Button>
                <Button disabled>Disabled</Button>
                <Button className="gap-2">
                  <Spinner size="sm" variant="white" />
                  Loading
                </Button>
              </div>
            </div>

            <CodeBlock>{`import { Button } from "@/components/ui/button";

<Button variant="default">Submit</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="destructive">Delete</Button>`}</CodeBlock>
          </div>
        </Section>

        {/* Badges Section */}
        <Section id="badges" title="Badges">
          <div className="space-y-8">
            {/* Core Variants */}
            <div>
              <Heading level="h3" className="mb-4">
                Core Variants
              </Heading>
              <div className="flex flex-wrap gap-3 p-6 rounded-lg border border-border">
                <Badge variant="default">Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
            </div>

            {/* Status Variants */}
            <div>
              <Heading level="h3" className="mb-4">
                Status Variants
              </Heading>
              <div className="flex flex-wrap gap-3 p-6 rounded-lg border border-border">
                <Badge variant="pending">Pending</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="error">Error</Badge>
                <Badge variant="info">Info</Badge>
              </div>
            </div>

            {/* Proposal States */}
            <div>
              <Heading level="h3" className="mb-4">
                Proposal States
              </Heading>
              <div className="flex flex-wrap gap-3 p-6 rounded-lg border border-border">
                <Badge variant="active">Active</Badge>
                <Badge variant="succeeded">Succeeded</Badge>
                <Badge variant="executed">Executed</Badge>
                <Badge variant="queued">Queued</Badge>
                <Badge variant="defeated">Defeated</Badge>
                <Badge variant="canceled">Canceled</Badge>
              </div>
            </div>

            <CodeBlock>{`import { Badge } from "@/components/ui/badge";

<Badge variant="success">Verified</Badge>
<Badge variant="active">Active</Badge>
<Badge variant="warning">Pending Review</Badge>`}</CodeBlock>
          </div>
        </Section>

        {/* Spinners Section */}
        <Section id="spinners" title="Spinners">
          <div className="space-y-8">
            {/* Sizes */}
            <div>
              <Heading level="h3" className="mb-4">
                Sizes
              </Heading>
              <div className="flex items-center gap-6 p-6 rounded-lg border border-border">
                <div className="text-center">
                  <Spinner size="xs" />
                  <Caption className="mt-2 block">xs</Caption>
                </div>
                <div className="text-center">
                  <Spinner size="sm" />
                  <Caption className="mt-2 block">sm</Caption>
                </div>
                <div className="text-center">
                  <Spinner size="md" />
                  <Caption className="mt-2 block">md</Caption>
                </div>
                <div className="text-center">
                  <Spinner size="lg" />
                  <Caption className="mt-2 block">lg</Caption>
                </div>
                <div className="text-center">
                  <Spinner size="xl" />
                  <Caption className="mt-2 block">xl</Caption>
                </div>
              </div>
            </div>

            {/* Variants */}
            <div>
              <Heading level="h3" className="mb-4">
                Variants
              </Heading>
              <div className="flex items-center gap-6 p-6 rounded-lg border border-border">
                <div className="text-center">
                  <Spinner variant="default" />
                  <Caption className="mt-2 block">default</Caption>
                </div>
                <div className="text-center">
                  <Spinner variant="primary" />
                  <Caption className="mt-2 block">primary</Caption>
                </div>
                <div className="text-center">
                  <Spinner variant="secondary" />
                  <Caption className="mt-2 block">secondary</Caption>
                </div>
                <div className="text-center bg-primary p-4 rounded-lg">
                  <Spinner variant="white" />
                  <Caption className="mt-2 block text-primary-foreground">white</Caption>
                </div>
                <div className="text-center">
                  <Spinner variant="success" />
                  <Caption className="mt-2 block">success</Caption>
                </div>
                <div className="text-center">
                  <Spinner variant="destructive" />
                  <Caption className="mt-2 block">destructive</Caption>
                </div>
              </div>
            </div>

            <CodeBlock>{`import { Spinner } from "@/components/ui/spinner";

<Spinner />
<Spinner size="lg" variant="primary" />
<Spinner size="sm" variant="white" />`}</CodeBlock>
          </div>
        </Section>

        {/* InfoBox Section */}
        <Section id="infobox" title="InfoBox">
          <div className="space-y-8">
            {/* Variants */}
            <div>
              <Heading level="h3" className="mb-4">
                Variants
              </Heading>
              <div className="space-y-4">
                <InfoBox variant="info">
                  This is an informational message with helpful context.
                </InfoBox>
                <InfoBox variant="success" title="Success!">
                  Your changes have been saved successfully.
                </InfoBox>
                <InfoBox variant="warning" title="Warning">
                  Please review your input before continuing.
                </InfoBox>
                <InfoBox variant="error" title="Error">
                  An error occurred. Please try again.
                </InfoBox>
                <InfoBox variant="muted">
                  A muted message for less important information.
                </InfoBox>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <Heading level="h3" className="mb-4">
                Sizes
              </Heading>
              <div className="space-y-4">
                <InfoBox variant="info" size="sm">
                  Small info box for compact spaces.
                </InfoBox>
                <InfoBox variant="info" size="md">
                  Medium info box (default size).
                </InfoBox>
                <InfoBox variant="info" size="lg">
                  Large info box for important messages.
                </InfoBox>
              </div>
            </div>

            <CodeBlock>{`import { InfoBox } from "@/components/ui/info-box";

<InfoBox variant="success" title="Saved!">
  Your changes have been saved.
</InfoBox>

<InfoBox variant="warning">
  Please review before submitting.
</InfoBox>`}</CodeBlock>
          </div>
        </Section>

        {/* Cards Section */}
        <Section id="cards" title="Cards">
          <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>
                    A brief description of the card content.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Text>
                    Card content goes here. Use cards to group related information.
                  </Text>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>With Badge</CardTitle>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <CardDescription>Card with status badge</CardDescription>
                </CardHeader>
                <CardContent>
                  <Text variant="muted">
                    Combine cards with badges and other components.
                  </Text>
                </CardContent>
              </Card>
            </div>

            <CodeBlock>{`import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>`}</CodeBlock>
          </div>
        </Section>

        {/* Forms Section */}
        <Section id="forms" title="Forms">
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Form Example</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <LabelText required>Email</LabelText>
                  <Input type="email" placeholder="you@example.com" />
                  <HelperText>We&apos;ll never share your email.</HelperText>
                </div>

                <div className="space-y-2">
                  <LabelText>Username</LabelText>
                  <Input placeholder="johndoe" />
                </div>

                <div className="space-y-2">
                  <LabelText>Password</LabelText>
                  <Input type="password" placeholder="Enter password" className="border-destructive" />
                  <HelperText variant="error">Password must be at least 8 characters.</HelperText>
                </div>

                <div className="flex gap-3">
                  <Button>Submit</Button>
                  <Button variant="outline">Cancel</Button>
                </div>
              </CardContent>
            </Card>

            <CodeBlock>{`import { Input } from "@/components/ui/input";
import { LabelText, HelperText } from "@/components/ui/typography";

<div className="space-y-2">
  <LabelText required>Email</LabelText>
  <Input type="email" placeholder="you@example.com" />
  <HelperText>Helper text here</HelperText>
</div>`}</CodeBlock>
          </div>
        </Section>

        {/* Design Tokens Section */}
        <Section id="tokens" title="Design Tokens">
          <div className="space-y-8">
            <InfoBox variant="info">
              Design tokens are defined in{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                src/lib/design-tokens.ts
              </code>
              . Import them to use consistent values across your components.
            </InfoBox>

            {/* Typography Tokens */}
            <div>
              <Heading level="h3" className="mb-4">
                Typography Tokens
              </Heading>
              <div className="p-6 rounded-lg border border-border space-y-3">
                {Object.entries(tokens.typography).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      tokens.typography.{key}
                    </code>
                    <span className="text-muted-foreground text-sm">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Spacing Tokens */}
            <div>
              <Heading level="h3" className="mb-4">
                Spacing Tokens
              </Heading>
              <div className="p-6 rounded-lg border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    tokens.spacing.section.gap
                  </code>
                  <span className="text-muted-foreground text-sm">space-y-8</span>
                </div>
                <div className="flex items-center justify-between">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    tokens.spacing.content.gap
                  </code>
                  <span className="text-muted-foreground text-sm">space-y-4</span>
                </div>
                <div className="flex items-center justify-between">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    tokens.spacing.inline.tight
                  </code>
                  <span className="text-muted-foreground text-sm">gap-2</span>
                </div>
                <div className="flex items-center justify-between">
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    tokens.spacing.inline.loose
                  </code>
                  <span className="text-muted-foreground text-sm">gap-4</span>
                </div>
              </div>
            </div>

            <CodeBlock>{`import { tokens } from "@/lib/design-tokens";

// Use in components
<h1 className={tokens.typography.h1}>Title</h1>
<div className={tokens.spacing.section.gap}>
  <Section1 />
  <Section2 />
</div>`}</CodeBlock>
          </div>
        </Section>

        {/* Color Migration */}
        <Section id="migration" title="Color Migration Guide">
          <div className="space-y-4">
            <Text variant="muted">
              When refactoring components, use this mapping to replace hardcoded colors with semantic tokens:
            </Text>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium">Old Pattern</th>
                    <th className="text-left py-3 px-4 font-medium">New Pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(tokens.colorMigration).map(([old, newVal]) => (
                    <tr key={old} className="border-b border-border">
                      <td className="py-3 px-4">
                        <code className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                          {old}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        <code className="text-xs bg-success/10 text-success px-2 py-1 rounded">
                          {newVal}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="container mx-auto px-4 text-center">
          <Text variant="muted">
            Design System for dao-app &middot; Built with Tailwind CSS + shadcn/ui
          </Text>
        </div>
      </footer>
    </div>
  );
}
