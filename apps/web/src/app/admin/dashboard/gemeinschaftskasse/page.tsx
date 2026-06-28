"use client";
import { useState } from "react";
import { Tabs } from "./_components/Tabs";
import { Uebersicht } from "./_components/Uebersicht";
import { Auszahlungen } from "./_components/Auszahlungen";
import { Mitglieder } from "./_components/Mitglieder";
import { Verlauf } from "./_components/Verlauf";

const TABS = ["Übersicht", "Auszahlungen", "Mitglieder", "Verlauf"] as const;
type Tab = (typeof TABS)[number];

export default function GemeinschaftskassePage() {
  const [tab, setTab] = useState<Tab>("Übersicht");
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gemeinschaftskasse</h1>
        <p className="text-sm text-muted-foreground">Die gemeinsame Kasse der Stadt — verwaltet von mehreren Personen.</p>
      </div>
      <Tabs tabs={TABS as unknown as string[]} active={tab} onChange={(t) => setTab(t as Tab)} />
      {tab === "Übersicht" && <Uebersicht />}
      {tab === "Auszahlungen" && <Auszahlungen />}
      {tab === "Mitglieder" && <Mitglieder />}
      {tab === "Verlauf" && <Verlauf />}
    </div>
  );
}
