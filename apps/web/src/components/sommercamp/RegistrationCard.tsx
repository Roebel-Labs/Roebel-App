"use client";

// Registration = wallet onboarding: connect with the Röbel App account
// (thirdweb in-app wallet), then name/age + consents. Submitting creates the
// developer row and opens the KI-Baukasten directly — das Sommer Camp läuft
// bereits (6 Wochen-Runden über die Sommerferien), daher kein Countdown mehr.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ConnectButton, useActiveAccount, useProfiles } from "thirdweb/react";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { wallets } from "@/lib/wallet-config";

type Status = "checking" | "form" | "registered";

// Nach der Anmeldung direkt in den KI-Baukasten: das Sommer Camp läuft bereits
// (6 Wochen-Runden über die Sommerferien), daher kein Countdown mehr.
function StartGate() {
  return (
    <>
      <p className="text-base text-[#3D4E68]">
        Das Sommer Camp läuft — leg direkt los und bau deine Mini-App.
      </p>
      <Link
        href="/dashboard/mini-apps?welcome=sommercamp"
        className="mt-1 rounded-full bg-[#00498B] px-6 py-3 text-base font-bold text-white"
      >
        Zum KI-Baukasten
      </Link>
    </>
  );
}

export function RegistrationCard({ night }: { night: boolean }) {
  const account = useActiveAccount();
  const { data: profiles } = useProfiles({ client });
  const [status, setStatus] = useState<Status>("checking");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [agb, setAgb] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailSent, setMailSent] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);

  // Login-E-Mail des Röbel-App-Kontos (thirdweb in-app wallet) — Empfänger
  // der Anmelde-Bestätigung.
  const authEmail =
    profiles?.find((p) => p.details?.email)?.details.email ?? null;

  useEffect(() => {
    if (!account?.address) return;
    let cancelled = false;
    setStatus("checking");
    fetch(`/api/sommercamp/register?wallet=${account.address.toLowerCase()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStatus(d.registered ? "registered" : "form");
      })
      .catch(() => {
        if (!cancelled) setStatus("form");
      });
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account?.address || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/sommercamp/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wallet-address": account.address,
        },
        body: JSON.stringify({
          name,
          age: Number(age),
          privacy,
          agb,
          newsletterOptIn: newsletter,
          email: newsletter ? email : undefined,
          authEmail: authEmail ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.");
        return;
      }
      // Erst die Erfolgs-Ansicht (StartGate) mit direktem Link in den
      // KI-Baukasten zeigen — der Nutzer springt selbst weiter.
      setMailSent(data.confirmationSent === true);
      setStatus("registered");
    } catch {
      setError("Keine Verbindung. Bitte versuche es erneut.");
    } finally {
      setSubmitting(false);
    }
  };

  // Weißes Karten-Panel wie auf dem Roll-Up — in beiden Modi.
  return (
    <div className="rounded-2xl bg-white p-6 text-[#12203A] shadow-xl">
      {!account ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-base text-[#3D4E68]">
            Melde dich mit deinem Röbel-App-Konto an — oder erstelle in einer
            Minute ein neues.
          </p>
          <ConnectButton
            client={client}
            chain={activeChain}
            wallets={wallets}
            autoConnect={false}
            connectButton={{
              label: "Kostenlos anmelden",
              style: {
                backgroundColor: night ? "#FFD84D" : "#00498B",
                color: night ? "#0E2A47" : "#ffffff",
                borderRadius: "9999px",
                fontWeight: 700,
                minWidth: "220px",
                height: "48px",
              },
            }}
            connectModal={{ title: "Beim Sommer Camp anmelden", size: "compact" }}
            theme={night ? "dark" : "light"}
          />
        </div>
      ) : status === "checking" ? (
        <div className="flex items-center justify-center gap-2 py-6 text-base text-[#6B7280]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Einen Moment …
        </div>
      ) : status === "registered" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <p className="font-bold">Du bist angemeldet!</p>
          {mailSent && (
            <p className="text-base text-[#3D4E68]">
              Eine Bestätigung ist unterwegs — schau in dein E-Mail-Postfach.
            </p>
          )}
          <StartGate />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="sc-name" className="text-base font-semibold">
              Name
            </label>
            <input
              id="sc-name"
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vor- und Nachname"
              className="mt-1 w-full rounded-lg border border-[#DFE6EF] px-3 py-2.5 text-base outline-none focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/20"
            />
          </div>
          <div>
            <label htmlFor="sc-age" className="text-base font-semibold">
              Alter
            </label>
            <input
              id="sc-age"
              type="number"
              required
              min={6}
              max={99}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="z. B. 14"
              className="mt-1 w-24 rounded-lg border border-[#DFE6EF] px-3 py-2.5 text-base outline-none focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/20"
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex cursor-pointer items-start gap-2.5 text-base">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00498B]"
              />
              <span>
                Ich akzeptiere die{" "}
                <Link href="/datenschutz" target="_blank" className="font-semibold text-[#00498B] underline">
                  Datenschutzerklärung
                </Link>{" "}
                <span className="text-[#B4B8C1]">(Pflicht)</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-base">
              <input
                type="checkbox"
                checked={agb}
                onChange={(e) => setAgb(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00498B]"
              />
              <span>
                Ich akzeptiere die{" "}
                <Link href="/agb" target="_blank" className="font-semibold text-[#00498B] underline">
                  AGB
                </Link>{" "}
                <span className="text-[#B4B8C1]">(Pflicht)</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-base">
              <input
                type="checkbox"
                checked={newsletter}
                onChange={(e) => {
                  setNewsletter(e.target.checked);
                  // E-Mail liegt schon im thirdweb-Konto — vorbefüllen statt
                  // erneut abfragen; ändern bleibt möglich.
                  if (e.target.checked && !email && authEmail) {
                    setEmail(authEmail);
                  }
                }}
                className="mt-0.5 h-4 w-4 accent-[#00498B]"
              />
              <span>
                Newsletter der Röbel App erhalten{" "}
                <span className="text-[#B4B8C1]">(optional)</span>
              </span>
            </label>
            {newsletter && (
              <div className="pl-6">
                {authEmail && email === authEmail && !editingEmail ? (
                  <p className="text-base text-[#3D4E68]">
                    Geht an <span className="font-semibold">{email}</span>{" "}
                    <button
                      type="button"
                      onClick={() => setEditingEmail(true)}
                      className="font-semibold text-[#00498B] underline"
                    >
                      Ändern
                    </button>
                  </p>
                ) : (
                  <>
                    <label htmlFor="sc-email" className="text-base font-semibold">
                      E-Mail
                    </label>
                    <input
                      id="sc-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="du@example.de"
                      className="mt-1 w-full rounded-lg border border-[#DFE6EF] px-3 py-2.5 text-base outline-none focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/20"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !name || !age || !privacy || !agb}
            className="w-full rounded-full bg-[#00498B] px-6 py-3.5 text-base font-bold text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Wird gesendet …" : "Jetzt anmelden"}
          </button>
        </form>
      )}
    </div>
  );
}
