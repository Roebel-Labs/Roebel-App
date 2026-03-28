"use client";

import { Suspense } from "react";
import GraphCanvas from "@/components/graph/GraphCanvas";

export default function SocialGraphPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          Bürger für Röbel
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Visualisierung des dezentralen sozialen Netzwerks unserer Gemeinde
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[60vh]">
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
