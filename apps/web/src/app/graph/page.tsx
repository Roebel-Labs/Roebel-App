"use client";

import { Suspense } from "react";
import GraphCanvas from "@/components/graph/GraphCanvas";

export default function SocialGraphPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-medium text-foreground">
            Bürger für Röbel
          </h1>
          <p className="text-muted-foreground mt-2">
            Visualisierung des dezentralen sozialen Netzwerks unserer Gemeinde
          </p>
        </div>
      </div>

      {/* Graph Canvas */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[calc(100vh-140px)]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Lade soziales Netzwerk...</p>
            </div>
          </div>
        }
      >
        <GraphCanvas />
      </Suspense>
    </div>
  );
}
