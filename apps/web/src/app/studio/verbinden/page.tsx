// Confirmation page for pairing Ortis Studio with a Röbel/Ortis account (spec 2026-11-12 §3.1).
// Reached by scanning the QR in the studio or typing the code. Two ways to confirm:
// the Röbel app (deep link) or an Ortis ID login in this browser. Always an explicit click.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectDevice } from "./ConnectDevice";

export const metadata: Metadata = {
  title: "Ortis Studio verbinden | Röbel App",
  robots: { index: false },
};

export default function Page() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 text-gray-900">
      <div className="mx-auto max-w-md">
        <Suspense fallback={null}>
          <ConnectDevice />
        </Suspense>
      </div>
    </main>
  );
}
