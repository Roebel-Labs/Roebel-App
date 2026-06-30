"use client";
import { useState } from "react";
import { CreatePayout } from "./CreatePayout";
import { PendingQueue } from "./PendingQueue";
import { Explainer } from "./ui/Explainer";

export function Auszahlungen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <Explainer title="Wie eine Auszahlung funktioniert">
        <p>
          Die Gemeinschaftskasse ist ein <strong>Gemeinschaftskonto mit mehreren Mitsignierern</strong>
          {" "}(ein 2-von-4-Multisig). Niemand kann allein Geld bewegen.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Vorschlagen:</strong> Ein Mitsignierer erstellt eine Auszahlung und gibt sie als Erste(r) frei.
          </li>
          <li>
            <strong>Freigeben:</strong> Weitere Mitsignierer bestätigen, bis die nötige Anzahl erreicht ist.
          </li>
          <li>
            <strong>Ausführen:</strong> Sobald genug Freigaben vorliegen, wird die Auszahlung auf der Blockchain
            ausgeführt.
          </li>
        </ol>
        <p>Jeder Schritt ist auf Gnosisscan nachvollziehbar. Geld verlässt die Kasse erst beim letzten Schritt.</p>
      </Explainer>
      <CreatePayout onCreated={refetch} />
      <PendingQueue refreshKey={refreshKey} />
    </div>
  );
}
