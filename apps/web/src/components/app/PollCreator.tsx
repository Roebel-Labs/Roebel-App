"use client";

import { Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreatePollInput } from "@/types/post";

interface PollCreatorProps {
  value: CreatePollInput | null;
  onChange: (poll: CreatePollInput | null) => void;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export function PollCreator({ value, onChange }: PollCreatorProps) {
  const poll = value || {
    poll_type: "single" as const,
    options: ["", ""],
    duration_days: 1 as const,
  };

  const update = (partial: Partial<CreatePollInput>) => {
    onChange({ ...poll, ...partial });
  };

  const setOption = (index: number, text: string) => {
    const newOptions = [...poll.options];
    newOptions[index] = text;
    update({ options: newOptions });
  };

  const addOption = () => {
    if (poll.options.length >= MAX_OPTIONS) return;
    update({ options: [...poll.options, ""] });
  };

  const removeOption = (index: number) => {
    if (poll.options.length <= MIN_OPTIONS) return;
    update({ options: poll.options.filter((_, i) => i !== index) });
  };

  return (
    <div className="px-4 pb-3 space-y-3">
      <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/50">
        {/* Poll type toggle */}
        <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => update({ poll_type: "single" })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              poll.poll_type === "single"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Einzelauswahl
          </button>
          <button
            type="button"
            onClick={() => update({ poll_type: "multi" })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              poll.poll_type === "multi"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mehrfachauswahl
          </button>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {poll.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={option}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={80}
                className="flex-1 bg-background rounded-md border border-input px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
              />
              {poll.options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                  aria-label="Option entfernen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add option */}
        {poll.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Option hinzufugen
          </button>
        )}

        {/* Duration */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Dauer:</span>
          <Select
            value={String(poll.duration_days)}
            onValueChange={(v) =>
              update({ duration_days: Number(v) as 1 | 3 | 7 })
            }
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Tag</SelectItem>
              <SelectItem value="3">3 Tage</SelectItem>
              <SelectItem value="7">7 Tage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Remove poll */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-destructive hover:text-destructive/80 font-medium transition-colors"
        >
          Umfrage entfernen
        </button>
      </div>
    </div>
  );
}
