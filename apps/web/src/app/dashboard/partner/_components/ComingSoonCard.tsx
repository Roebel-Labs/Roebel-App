"use client";

import { Sparkles } from "lucide-react";

interface Props {
  title: string;
  description: string;
}

export function ComingSoonCard({ title, description }: Props) {
  return (
    <div className="bg-muted/40 border border-dashed border-border rounded-[10px] p-6 flex gap-3">
      <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          {description}{" "}
          <a
            href="mailto:partner@roebel.app?subject=Feature%20Vorschlag"
            className="text-primary underline"
          >
            Bescheid geben
          </a>
        </p>
      </div>
    </div>
  );
}
