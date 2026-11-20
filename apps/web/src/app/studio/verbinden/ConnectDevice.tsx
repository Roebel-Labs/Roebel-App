"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Lookup = { code: string; deviceName: string; state: "pending" | "approved" | "claimed" | "expired" };
type Phase = "idle" | "busy" | "done" | "error";

const LOGIN = "/api/workspace/auth/login?returnTo=";

export function ConnectDevice() {
  const params = useSearchParams();
  const raw = params.get("code") ?? "";
  const [typed, setTyped] = useState(raw);
  const [info, setInfo] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  /** null = not checked yet. Decides which single button is primary. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/chat/pair/me")
      .then((r) => r.json())
      .then((j) => setSignedIn(!!j?.signedIn))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!raw) return;
    let alive = true;
    fetch(`/api/chat/pair/lookup?code=${encodeURIComponent(raw)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (r.ok) setInfo(j as Lookup);
        else setLookupError(j?.error?.message ?? "Der Code konnte nicht geprüft werden.");
      })
      .catch(() => alive && setLookupError("Keine Verbindung zum Server."));
    return () => {
      alive = false;
    };
  }, [raw]);

  if (!raw) {
    return (
      <section>
        <h1 className="font-heading text-2xl font-bold">Ortis Studio verbinden</h1>
        <p className="mt-2 text-gray-600">Gib den Code ein, den Ortis Studio auf deinem Rechner zeigt.</p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.search = `?code=${encodeURIComponent(typed.trim())}`;
          }}
        >
          <input
            className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono uppercase tracking-widest"
            placeholder="ABCD-EFGH"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
          />
          <button className="rounded bg-[#00498B] px-4 py-2 font-semibold text-white">Weiter</button>
        </form>
      </section>
    );
  }

  const confirm = async () => {
    setPhase("busy");
    setMessage(null);
    try {
      const r = await fetch("/api/chat/pair/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: raw }),
      });
      const j = await r.json().catch(() => null);
      if (r.status === 401) {
        setNeedsLogin(true);
        setPhase("idle");
        return;
      }
      if (!r.ok) throw new Error(j?.error?.message ?? "Das hat nicht geklappt.");
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setMessage((e as Error).message);
    }
  };

  const returnTo = `/studio/verbinden?code=${encodeURIComponent(raw)}`;
  // Android: an intent link opens the installed app reliably from Chrome (falls back to this page).
  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
  const appLink = isAndroid
    ? `intent://chat/pair?code=${encodeURIComponent(raw)}#Intent;scheme=roebel;package=com.maxbrych.roebelonchain;end`
    : `roebel://chat/pair?code=${encodeURIComponent(raw)}`;

  return (
    <section>
      <h1 className="font-heading text-2xl font-bold">Ortis Studio verbinden</h1>
      {lookupError && <p className="mt-4 rounded bg-red-50 p-3 text-red-700">{lookupError}</p>}
      {info && (
        <>
          <p className="mt-2 text-gray-600">
            <strong className="text-gray-900">{info.deviceName}</strong> möchte sich mit deinem Konto verbinden.
          </p>
          <div className="mt-4 rounded border border-gray-200 p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500">Code</div>
            <div className="mt-1 font-mono text-3xl font-bold tracking-widest">{info.code}</div>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Bestätige nur, wenn genau dieser Code gerade auf <em>deinem</em> Bildschirm steht. Wer verbunden ist, kann
            in deinem Namen mit deinen Assistenten schreiben.
          </p>
          {info.state === "expired" && (
            <p className="mt-4 rounded bg-amber-50 p-3 text-amber-800">Der Code ist abgelaufen. Zeig in Ortis Studio einen neuen an.</p>
          )}
          {(info.state === "approved" || info.state === "claimed") && phase !== "done" && (
            <p className="mt-4 rounded bg-amber-50 p-3 text-amber-800">Dieser Code wurde schon verwendet.</p>
          )}
          {info.state === "pending" && phase !== "done" && (
            <div className="mt-6 flex flex-col gap-3">
              {signedIn && !needsLogin ? (
                <>
                  <p className="rounded bg-green-50 p-3 text-sm text-green-800">Du bist mit deiner Ortis ID angemeldet.</p>
                  <button
                    onClick={confirm}
                    disabled={phase === "busy"}
                    className="rounded bg-[#00498B] px-4 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {phase === "busy" ? "Verbinde …" : "Ortis Studio jetzt verbinden"}
                  </button>
                </>
              ) : (
                <a href={LOGIN + encodeURIComponent(returnTo)} className="rounded bg-[#00498B] px-4 py-3 text-center font-semibold text-white">
                  Mit Ortis ID anmelden
                </a>
              )}
              <a href={appLink} className="rounded border border-gray-300 px-4 py-3 text-center font-semibold">
                Stattdessen in der Röbel App bestätigen
              </a>
              {!signedIn && (
                <p className="text-sm text-gray-600">Nach der Anmeldung kommst du hierher zurück und tippst auf „Ortis Studio jetzt verbinden“.</p>
              )}
            </div>
          )}
          {phase === "done" && (
            <p className="mt-6 rounded bg-green-50 p-3 text-green-800">Verbunden. Ortis Studio meldet sich gleich an, du kannst dieses Fenster schließen.</p>
          )}
          {message && <p className="mt-4 rounded bg-red-50 p-3 text-red-700">{message}</p>}
        </>
      )}
    </section>
  );
}
