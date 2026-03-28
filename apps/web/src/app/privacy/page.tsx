import { Metadata } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";
import PrivacyPolicyContent from "@/components/PrivacyPolicyContent";

export const metadata: Metadata = {
  title: "Privacy Policy | MüritzPhone DAO",
  description:
    "Privacy Policy of MüritzPhone DAO - Information about the collection, processing and use of personal data in accordance with GDPR.",
};

export default async function PrivacyPage() {
  // Read the markdown file from public directory
  const filePath = path.join(process.cwd(), "public", "privacy.md");
  const markdownContent = fs.readFileSync(filePath, "utf8");

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-6">
          <h1 className="text-4xl font-medium text-gray-900 dark:text-white mb-2">
            Privacy Policy
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Information about the collection and processing of personal data
          </p>
        </div>

        {/* Language Switcher */}
        <div className="mb-6 flex gap-3">
          <a
            href="/datenschutz"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            🇩🇪 Deutsch
          </a>
          <span className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium">
            🇬🇧 English
          </span>
        </div>

        {/* Content */}
        <PrivacyPolicyContent content={markdownContent} />

        {/* Data Deletion */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Delete Your Account and Data
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You have the right to request deletion of your account and all associated personal data in accordance with GDPR Article 17.
            </p>
            <Link
              href="/delete-account"
              className="inline-block bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Delete My Account and Data
            </Link>
          </div>

          {/* Footer Contact */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Privacy Questions?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              If you have questions about this privacy policy or wish to
              exercise your rights, contact us:
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:mueritzphone@gmail.com"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  mueritzphone@gmail.com
                </a>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Phone:</strong> 039931 148019
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Address:</strong> MüritzPhone, Hohe Straße 2, 17207
                Röbel/Müritz, Germany
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
            Impressum (Legal Notice)
          </Link>
          <Link
            href="/datenschutz"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Datenschutzerklärung (Deutsch)
          </Link>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
