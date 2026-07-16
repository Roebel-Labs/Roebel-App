// Stripe success landing for treasury contributions. Mirrors
// /roebel-card/success: brief confirmation + deeplink back into the app
// when the checkout was opened from the expo in-app browser.

import Link from "next/link";
import { SuccessRedirect } from "./success-redirect";

const FALLBACK_TARGET = "/spenden";
const RETURN_TO_ALLOWLIST = /^(roebel:\/\/|https:\/\/roebel\.app\/)/;

function validateReturnTo(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!RETURN_TO_ALLOWLIST.test(value)) return null;
  return value;
}

export default async function DankePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; return_to?: string }>;
}) {
  const { return_to: rawReturnTo } = await searchParams;
  const returnTo = validateReturnTo(rawReturnTo);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Logo-new.png"
          alt="Röbel App"
          className="h-11 w-auto mx-auto mb-6 object-contain"
        />
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Vielen Dank! 💙
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Dein Beitrag stärkt die Gemeinschaftskasse von Röbel/Müritz. Sobald die
          Zahlung verarbeitet ist, erscheint er im öffentlichen Verlauf — für
          alle sichtbar.
        </p>
        {returnTo ? (
          <SuccessRedirect returnTo={returnTo} />
        ) : (
          <Link
            href={FALLBACK_TARGET}
            className="inline-flex items-center justify-center rounded-full bg-[#00498B] text-white px-5 py-3 text-sm font-semibold"
          >
            Zurück
          </Link>
        )}
      </div>
    </div>
  );
}
