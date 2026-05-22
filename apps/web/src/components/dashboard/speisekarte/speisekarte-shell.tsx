"use client";

import { useState } from "react";
import { MenuTab } from "@/components/admin/restaurants/menu-tab";
import { SpecialMenusTab } from "@/components/admin/restaurants/special-menus-tab";
import { AiStyleSelector } from "@/components/dashboard/speisekarte/ai-style-selector";
import type { Restaurant } from "@/types/restaurant";

type TabKey = "menu" | "specials" | "ai";

interface SpeisekarteShellProps {
  restaurant: Restaurant;
}

const TABS: { id: TabKey; label: string }[] = [
  { id: "menu", label: "Speisekarte" },
  { id: "specials", label: "Spezialmenüs" },
  { id: "ai", label: "KI-Bilder" },
];

export function SpeisekarteShell({ restaurant }: SpeisekarteShellProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("menu");
  const [currentStyle, setCurrentStyle] = useState(restaurant.ai_image_style);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Speisekarte</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Verwalte Kategorien, Gerichte und KI-generierte Bilder für {restaurant.name}.
        </p>
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "menu" && (
        <MenuTab restaurantId={restaurant.id} restaurantAiStyle={currentStyle} />
      )}
      {activeTab === "specials" && (
        <SpecialMenusTab restaurantId={restaurant.id} restaurantAiStyle={currentStyle} />
      )}
      {activeTab === "ai" && (
        <AiStyleSelector
          restaurantId={restaurant.id}
          initialStyle={currentStyle}
          onSaved={(style) => setCurrentStyle(style)}
        />
      )}
    </div>
  );
}
