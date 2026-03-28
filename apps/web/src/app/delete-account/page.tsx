"use client";

import { useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { Header } from "@/components/layout/Header";
import Link from "next/link";

export default function DeleteAccountPage() {
  const account = useActiveAccount();
  const [language, setLanguage] = useState<"de" | "en">("de");
  const [step, setStep] = useState<"initial" | "confirm" | "deleting" | "success" | "error">("initial");
  const [error, setError] = useState<string | null>(null);

  const content = {
    de: {
      title: "Konto und Daten löschen",
      subtitle: "Löschen Sie Ihr Konto und alle zugehörigen Daten",
      notConnected: {
        title: "Wallet nicht verbunden",
        description: "Bitte verbinden Sie Ihre Wallet, um Ihr Konto zu löschen.",
        button: "Zur Startseite",
      },
      warning: {
        title: "⚠️ Warnung: Diese Aktion ist unwiderruflich",
        description: "Das Löschen Ihres Kontos wird dauerhaft alle folgenden Daten entfernen:",
        items: [
          "Ihr Benutzerprofil (Benutzername, Profilbild, Bio)",
          "Wallet-Adresse und Telefonnummer",
          "Gamification-Statistiken (Punkte, Abstimmungen, Streaks)",
          "NFT-Balance-Cache und Delegierungsstatus",
          "Konto-Erstellungs- und Anmeldedaten",
        ],
        blockchainNote: "Hinweis: On-chain Blockchain-Daten (NFTs, Abstimmungen) können nicht gelöscht werden, da sie unveränderlich sind.",
        button: "Ich verstehe, fortfahren",
      },
      confirm: {
        title: "Bestätigung erforderlich",
        description: "Sind Sie sicher, dass Sie Ihr Konto dauerhaft löschen möchten?",
        warning: "Diese Aktion kann nicht rückgängig gemacht werden. Alle Ihre Daten werden dauerhaft aus unserer Datenbank gelöscht.",
        walletAddress: "Wallet-Adresse:",
        cancel: "Abbrechen",
        confirmButton: "Ja, Konto jetzt löschen",
      },
      deleting: {
        title: "Konto wird gelöscht...",
        description: "Bitte warten Sie, während wir Ihr Konto und alle zugehörigen Daten löschen.",
      },
      success: {
        title: "✅ Konto erfolgreich gelöscht",
        description: "Ihr Konto und alle zugehörigen Daten wurden dauerhaft aus unserer Datenbank gelöscht.",
        info: "Vielen Dank, dass Sie MüritzPhone DAO genutzt haben. Sie können jederzeit ein neues Konto erstellen, indem Sie Ihre Wallet erneut verbinden.",
        button: "Zur Startseite",
      },
      error: {
        title: "❌ Fehler beim Löschen des Kontos",
        retry: "Erneut versuchen",
        home: "Zur Startseite",
      },
      support: {
        title: "Benötigen Sie Hilfe?",
        description: "Wenn Sie Probleme beim Löschen Ihres Kontos haben oder Fragen haben, kontaktieren Sie uns:",
        email: "E-Mail:",
        phone: "Telefon:",
      },
      links: {
        privacy: "Datenschutzerklärung",
        home: "Zurück zur Startseite",
      },
    },
    en: {
      title: "Delete Account and Data",
      subtitle: "Delete your account and all associated data",
      notConnected: {
        title: "Wallet Not Connected",
        description: "Please connect your wallet to delete your account.",
        button: "Go to Home",
      },
      warning: {
        title: "⚠️ Warning: This Action is Irreversible",
        description: "Deleting your account will permanently remove all of the following data:",
        items: [
          "Your user profile (username, profile picture, bio)",
          "Wallet address and phone number",
          "Gamification statistics (points, votes, streaks)",
          "NFT balance cache and delegation status",
          "Account creation and login timestamps",
        ],
        blockchainNote: "Note: On-chain blockchain data (NFTs, votes) cannot be deleted as they are immutable.",
        button: "I Understand, Proceed",
      },
      confirm: {
        title: "Confirmation Required",
        description: "Are you absolutely sure you want to permanently delete your account?",
        warning: "This action cannot be undone. All of your data will be permanently deleted from our database.",
        walletAddress: "Wallet Address:",
        cancel: "Cancel",
        confirmButton: "Yes, Delete My Account Now",
      },
      deleting: {
        title: "Deleting Account...",
        description: "Please wait while we delete your account and all associated data.",
      },
      success: {
        title: "✅ Account Successfully Deleted",
        description: "Your account and all associated data have been permanently deleted from our database.",
        info: "Thank you for using MüritzPhone DAO. You can create a new account at any time by reconnecting your wallet.",
        button: "Go to Home",
      },
      error: {
        title: "❌ Error Deleting Account",
        retry: "Try Again",
        home: "Go to Home",
      },
      support: {
        title: "Need Help?",
        description: "If you're having trouble deleting your account or have questions, contact us:",
        email: "Email:",
        phone: "Phone:",
      },
      links: {
        privacy: "Privacy Policy",
        home: "Back to Home",
      },
    },
  };

  const t = content[language];

  const handleDeleteAccount = async () => {
    if (!account?.address) return;

    setStep("deleting");
    setError(null);

    try {
      const response = await fetch(`/api/users/delete?wallet_address=${account.address}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete account");
      }

      setStep("success");
    } catch (err) {
      console.error("Error deleting account:", err);
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setStep("error");
    }
  };

  // Not connected state
  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <Header />
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Language Switcher */}
          <div className="mb-6 flex gap-3 justify-end">
            <button
              onClick={() => setLanguage("de")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                language === "de"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              🇩🇪 Deutsch
            </button>
            <button
              onClick={() => setLanguage("en")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                language === "en"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              🇬🇧 English
            </button>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-medium text-gray-900 dark:text-white mb-4">
              {t.notConnected.title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t.notConnected.description}
            </p>
            <Link
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              {t.notConnected.button}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <Header />

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-6">
          <h1 className="text-4xl font-medium text-gray-900 dark:text-white mb-2">
            {t.title}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">{t.subtitle}</p>
        </div>

        {/* Language Switcher */}
        <div className="mb-6 flex gap-3 justify-end">
          <button
            onClick={() => setLanguage("de")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              language === "de"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            🇩🇪 Deutsch
          </button>
          <button
            onClick={() => setLanguage("en")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              language === "en"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            🇬🇧 English
          </button>
        </div>

        {/* Initial Warning State */}
        {step === "initial" && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800 rounded-lg p-8">
            <h2 className="text-2xl font-medium text-red-900 dark:text-red-200 mb-4">
              {t.warning.title}
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {t.warning.description}
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-gray-700 dark:text-gray-300">
              {t.warning.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <strong>ℹ️</strong> {t.warning.blockchainNote}
              </p>
            </div>
            <button
              onClick={() => setStep("confirm")}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              {t.warning.button}
            </button>
          </div>
        )}

        {/* Confirmation State */}
        {step === "confirm" && (
          <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8">
            <h2 className="text-2xl font-medium text-gray-900 dark:text-white mb-4">
              {t.confirm.title}
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {t.confirm.description}
            </p>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-900 dark:text-yellow-200 font-medium">
                {t.confirm.warning}
              </p>
            </div>
            <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {t.confirm.walletAddress}
              </p>
              <p className="text-gray-900 dark:text-white font-mono text-sm break-all">
                {account.address}
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setStep("initial")}
                className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {t.confirm.cancel}
              </button>
              <button
                onClick={handleDeleteAccount}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {t.confirm.confirmButton}
              </button>
            </div>
          </div>
        )}

        {/* Deleting State */}
        {step === "deleting" && (
          <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-2xl font-medium text-gray-900 dark:text-white mb-4">
              {t.deleting.title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t.deleting.description}
            </p>
          </div>
        )}

        {/* Success State */}
        {step === "success" && (
          <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-medium text-green-900 dark:text-green-200 mb-4">
              {t.success.title}
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {t.success.description}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t.success.info}
            </p>
            <Link
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              {t.success.button}
            </Link>
          </div>
        )}

        {/* Error State */}
        {step === "error" && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-medium text-red-900 dark:text-red-200 mb-4">
              {t.error.title}
            </h2>
            {error && (
              <p className="text-gray-700 dark:text-gray-300 mb-6 font-mono text-sm bg-red-100 dark:bg-red-900/40 p-3 rounded">
                {error}
              </p>
            )}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setStep("initial")}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {t.error.retry}
              </button>
              <Link
                href="/"
                className="inline-block bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {t.error.home}
              </Link>
            </div>
          </div>
        )}

        {/* Support Section */}
        {step !== "success" && (
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              {t.support.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t.support.description}
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                <strong>{t.support.email}</strong>{" "}
                <a
                  href="mailto:mueritzphone@gmail.com"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  mueritzphone@gmail.com
                </a>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>{t.support.phone}</strong> 039931 148019
              </p>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="mt-8 flex flex-wrap gap-4 text-sm justify-center">
          <Link
            href={language === "de" ? "/datenschutz" : "/privacy"}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t.links.privacy}
          </Link>
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t.links.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
