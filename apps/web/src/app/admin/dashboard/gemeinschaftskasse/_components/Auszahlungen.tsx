"use client";
import { useState } from "react";
import { CreatePayout } from "./CreatePayout";
import { PendingQueue } from "./PendingQueue";

export function Auszahlungen() {
  const [refreshKey, setRefreshKey] = useState(0);

  function refetch() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      <CreatePayout onCreated={refetch} />
      <PendingQueue refreshKey={refreshKey} />
    </div>
  );
}
