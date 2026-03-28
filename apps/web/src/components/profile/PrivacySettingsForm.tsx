"use client";

import type { PrivacySettings, VisibilityLevel } from "@/lib/user-types";
import { getVisibilityLabel } from "@/lib/user-types";

interface PrivacySettingsFormProps {
  settings: PrivacySettings;
  onChange: (settings: PrivacySettings) => void;
}

const FIELD_LABELS: { key: keyof PrivacySettings; label: string }[] = [
  { key: "bio", label: "Bio" },
  { key: "neighborhood", label: "Stadtteil" },
  { key: "interests", label: "Interessen" },
  { key: "vereine", label: "Vereine" },
  { key: "email", label: "E-Mail" },
  { key: "phone_number", label: "Telefon" },
  { key: "voting_history", label: "Abstimmungshistorie" },
  { key: "gamification_points", label: "Punkte" },
];

const VISIBILITY_OPTIONS: VisibilityLevel[] = ["public", "citizens", "private"];

export function PrivacySettingsForm({ settings, onChange }: PrivacySettingsFormProps) {
  const handleChange = (key: keyof PrivacySettings, value: VisibilityLevel) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-1">
      {FIELD_LABELS.map(({ key, label }) => (
        <div
          key={key}
          className="flex items-center justify-between py-2.5 px-1"
        >
          <span className="text-sm text-foreground">{label}</span>
          <select
            value={settings[key]}
            onChange={(e) => handleChange(key, e.target.value as VisibilityLevel)}
            className="bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring transition-colors"
          >
            {VISIBILITY_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {getVisibilityLabel(level)}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
