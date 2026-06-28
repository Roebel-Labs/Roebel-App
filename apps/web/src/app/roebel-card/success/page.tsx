// Stripe success landing for the Röbel Card checkout.
// Shows a brief confirmation and auto-fires the `roebel://` deeplink that
// bounces the user back into the mobile app. Also handles the
// cancelled=true case by showing a neutral message with the same return
// affordance.

import { SuccessRedirect } from "./success-redirect";

const FALLBACK_DEEPLINK = "roebel://roebel-card";
const RETURN_TO_ALLOWLIST = /^(roebel:\/\/|https:\/\/roebel\.app\/)/;

function validateReturnTo(value: string | undefined | null): string {
  if (!value) return FALLBACK_DEEPLINK;
  if (!RETURN_TO_ALLOWLIST.test(value)) return FALLBACK_DEEPLINK;
  return value;
}

export default async function RoebelCardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string;
    return_to?: string;
    cancelled?: string;
  }>;
}) {
  const { return_to: rawReturnTo, cancelled } = await searchParams;
  const returnTo = validateReturnTo(rawReturnTo);
  const isCancelled = cancelled === "true";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Logo-new.png"
          alt="Röbel App"
          className="h-11 w-auto mx-auto mb-6 object-contain"
        />
        {isCancelled ? (
          <>
            <h1 className="text-xl font-semibold text-foreground mb-2">
              Zahlung abgebrochen
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Kein Guthaben wurde abgebucht. Du kannst jederzeit zur App
              zurückkehren.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground mb-2">
              Vielen Dank!
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Dein Röbel Card Guthaben wird geladen. Du wirst zur App
              zurückgeleitet…
            </p>
          </>
        )}
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
