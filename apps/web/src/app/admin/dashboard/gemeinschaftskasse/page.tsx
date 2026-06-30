"use client";
import { useEffect, useState } from "react";
import { Tabs } from "./_components/Tabs";
import { Uebersicht } from "./_components/Uebersicht";
import { Auszahlungen } from "./_components/Auszahlungen";
import { Mitglieder } from "./_components/Mitglieder";
import { Verlauf } from "./_components/Verlauf";
import { Anfragen } from "./_components/Anfragen";

const TABS = ["Übersicht", "Auszahlungen", "Anfragen", "Mitglieder", "Verlauf"] as const;
type Tab = (typeof TABS)[number];

export default function GemeinschaftskassePage() {
  const [tab, setTab] = useState<Tab>("Übersicht");
  const [anfragenCount, setAnfragenCount] = useState(0);

  useEffect(() => {
    function fetchCount() {
      fetch("/api/gemeinschaftskasse/messages")
        .then((r) => r.json())
        .then((d) => {
          if (d.items) {
            setAnfragenCount(d.items.filter((m: { fullySigned: boolean }) => !m.fullySigned).length);
          }
        })
        .catch(() => {/* silently ignore badge fetch errors */});
    }
    fetchCount();
    const id = setInterval(fetchCount, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gemeinschaftskasse</h1>
        <p className="text-sm text-muted-foreground">Die gemeinsame Kasse der Stadt — verwaltet von mehreren Personen.</p>
      </div>
      <Tabs
        tabs={TABS as unknown as string[]}
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        badges={{ Anfragen: anfragenCount }}
      />
      {tab === "Übersicht" && <Uebersicht />}
      {tab === "Auszahlungen" && <Auszahlungen />}
      {tab === "Anfragen" && <Anfragen />}
      {tab === "Mitglieder" && <Mitglieder />}
      {tab === "Verlauf" && <Verlauf />}
    </div>
  );
}
