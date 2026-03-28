"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle, Mail, QrCode, ArrowLeft } from "lucide-react";
import Link from "next/link";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-green-600 p-8 text-center">
            <CheckCircle className="h-20 w-20 text-white mx-auto" />
            <h1 className="mt-4 text-3xl font-bold text-white">
              Zahlung erfolgreich!
            </h1>
            <p className="mt-2 text-green-100">
              Vielen Dank für Ihren Kauf
            </p>
          </div>

          {/* Steps */}
          <div className="p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-900/30 rounded-lg shrink-0">
                <Mail className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-white">E-Mail prüfen</p>
                <p className="text-sm text-gray-400 mt-1">
                  Sie erhalten in Kürze eine Bestätigungs-E-Mail mit Ihrem
                  Ticket und QR-Code.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-900/30 rounded-lg shrink-0">
                <QrCode className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-white">QR-Code vorzeigen</p>
                <p className="text-sm text-gray-400 mt-1">
                  Zeigen Sie den QR-Code aus der E-Mail am Eingang vor.
                  So erhalten Sie Zutritt zur Veranstaltung.
                </p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-400">
                Keine E-Mail erhalten? Prüfen Sie Ihren Spam-Ordner oder
                kontaktieren Sie uns unter{" "}
                <a
                  href="mailto:support@roebel.app"
                  className="text-green-400 hover:underline"
                >
                  support@roebel.app
                </a>
              </p>
            </div>

            {sessionId && (
              <p className="text-xs text-gray-600 text-center font-mono break-all">
                Referenz: {sessionId}
              </p>
            )}
          </div>

          {/* Back Button */}
          <div className="p-6 pt-0">
            <Link
              href="/landesmeisterschaft"
              className="flex items-center justify-center gap-2 w-full py-4 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Zurück zur Veranstaltung
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-gray-600 text-sm">
          MV Boxen Landesmeisterschaft 2026
        </p>
      </div>
    </div>
  );
}

export default function TicketSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <p className="text-gray-400">Laden...</p>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
