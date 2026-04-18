import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AGB | Röbel",
  description:
    "Allgemeine Geschäftsbedingungen für die Nutzung der Röbel App.",
};

export default function AgbPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8 border-b border-gray-200 pb-6 dark:border-gray-700">
          <h1 className="mb-2 text-4xl font-medium text-gray-900 dark:text-white">
            Allgemeine Geschäftsbedingungen
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Nutzungsbedingungen der Röbel App
          </p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none">
          <p>
            Willkommen bei Röbel. Mit der Nutzung der App akzeptierst du die
            folgenden Bedingungen. Wir werden die vollständige Fassung in Kürze
            an dieser Stelle veröffentlichen.
          </p>

          <h2>1. Geltungsbereich</h2>
          <p>
            Diese Bedingungen gelten für alle Nutzerinnen und Nutzer der Röbel
            App und der damit verbundenen Dienste.
          </p>

          <h2>2. Respektvoller Umgang</h2>
          <p>
            Mit deiner Zustimmung verpflichtest du dich, alle Mitglieder der
            Röbel-Gemeinschaft mit Respekt und ohne Vorurteile zu behandeln.
          </p>

          <h2>3. Datenschutz</h2>
          <p>
            Informationen darüber, wie wir deine Daten verarbeiten, findest du
            in unserer{" "}
            <Link href="/datenschutz" className="text-blue-600 underline">
              Datenschutzerklärung
            </Link>
            .
          </p>

          <h2>4. Kontakt</h2>
          <p>
            Bei Fragen zu diesen Bedingungen erreichst du uns unter
            <a href="mailto:kontakt@roebel.app" className="ml-1 text-blue-600 underline">
              kontakt@roebel.app
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
