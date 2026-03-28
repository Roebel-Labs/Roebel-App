import { Metadata } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";
import PrivacyPolicyContent from "@/components/PrivacyPolicyContent";

export const metadata: Metadata = {
  title: "Datenschutzerklärung | MüritzPhone DAO",
  description:
    "Datenschutzerklärung der MüritzPhone DAO - Informationen über die Erhebung, Verarbeitung und Nutzung personenbezogener Daten gemäß DSGVO.",
};

export default async function DatenschutzPage() {
  // Read the markdown file from public directory
  const filePath = path.join(process.cwd(), "public", "datenschutz.md");
  const markdownContent = fs.readFileSync(filePath, "utf8");

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-6">
          <h1 className="text-4xl font-medium text-gray-900 dark:text-white mb-2">
            Datenschutzerklärung
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Informationen über die Erhebung und Verarbeitung personenbezogener
            Daten
          </p>
        </div>

        {/* Language Switcher */}
        <div className="mb-6 flex gap-3">
          <span className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium">
            🇩🇪 Deutsch
          </span>
          <a
            href="/privacy"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            🇬🇧 English
          </a>
        </div>

        {/* Content */}
        <PrivacyPolicyContent content={markdownContent} />

        {/* Data Deletion */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Konto und Daten löschen
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Sie haben das Recht, die Löschung Ihres Kontos und aller zugehörigen personenbezogenen Daten gemäß Art. 17 DSGVO zu beantragen.
            </p>
            <Link
              href="/delete-account"
              className="inline-block bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Mein Konto und Daten löschen
            </Link>
          </div>

          {/* Footer Contact */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Fragen zum Datenschutz?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Bei Fragen zu dieser Datenschutzerklärung oder zur Ausübung Ihrer
              Rechte kontaktieren Sie uns:
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                <strong>E-Mail:</strong>{" "}
                <a
                  href="mailto:mueritzphone@gmail.com"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  mueritzphone@gmail.com
                </a>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Telefon:</strong> 039931 148019
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Adresse:</strong> MüritzPhone, Hohe Straße 2, 17207
                Röbel/Müritz
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link
            href="/impressum"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Impressum
          </Link>
          <Link
            href="/privacy"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Privacy Policy (English)
          </Link>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
