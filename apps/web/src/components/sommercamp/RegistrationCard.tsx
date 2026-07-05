"use client";

// Registration = wallet onboarding: connect with the Röbel App account
// (thirdweb in-app wallet), then name/age + consents. Submitting creates the
// developer row, so the participant lands in the mini-app builder dashboard.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { wallets } from "@/lib/wallet-config";

type Status = "checking" | "form" | "registered";

export function RegistrationCard({ night }: { night: boolean }) {
  const account = useActiveAccount();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [agb, setAgb] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.");
        return;
      }
      router.push("/dashboard/mini-apps?welcome=sommercamp");
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
          <p className="text-sm text-[#3D4E68]">
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
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#6B7280]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Einen Moment …
        </div>
      ) : status === "registered" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <p className="font-bold">Du bist angemeldet!</p>
          <p className="text-sm text-[#3D4E68]">
            Leg direkt los und bau deine erste Mini-App.
          </p>
          <Link
            href="/dashboard/mini-apps?welcome=sommercamp"
            className="mt-1 rounded-full bg-[#00498B] px-6 py-3 text-sm font-bold text-white"
          >
            Zum KI-Baukasten
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="sc-name" className="text-sm font-semibold">
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
              className="mt-1 w-full rounded-lg border border-[#DFE6EF] px-3 py-2.5 text-sm outline-none focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/20"
            />
          </div>
          <div>
            <label htmlFor="sc-age" className="text-sm font-semibold">
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
              className="mt-1 w-24 rounded-lg border border-[#DFE6EF] px-3 py-2.5 text-sm outline-none focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/20"
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
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
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
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
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={newsletter}
                onChange={(e) => setNewsletter(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00498B]"
              />
              <span>
                Newsletter der Röbel App erhalten{" "}
                <span className="text-[#B4B8C1]">(optional)</span>
              </span>
            </label>
            {newsletter && (
              <div className="pl-6">
                <label htmlFor="sc-email" className="text-sm font-semibold">
                  E-Mail
                </label>
                <input
                  id="sc-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="du@example.de"
                  className="mt-1 w-full rounded-lg border border-[#DFE6EF] px-3 py-2.5 text-sm outline-none focus:border-[#00498B] focus:ring-2 focus:ring-[#00498B]/20"
                />
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !name || !age || !privacy || !agb}
            className="w-full rounded-full bg-[#00498B] px-6 py-3.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Wird gesendet …" : "Anmelden & losbauen"}
          </button>
        </form>
      )}
    </div>
  );
}
