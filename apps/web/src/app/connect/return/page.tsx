import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";

const FALLBACK = "roebel://org/payments";
// Exactly the one deep link this page is ever asked to hand back to. A prefix match on
// "roebel://" would let ?return_to= point the returning organiser at any screen in the app.
const ALLOW = /^roebel:\/\/org\/payments$/;

// Shared return page for payment onboarding: Stripe account links and the Mollie OAuth callback
// (/api/payments/mollie/callback adds provider=mollie and, on failure, error=true).
export default async function ConnectReturnPage({ searchParams }: { searchParams: Promise<{ return_to?: string; refresh?: string; error?: string }> }) {
  const { return_to, refresh, error } = await searchParams;
  const returnTo = return_to && ALLOW.test(return_to) ? return_to : FALLBACK;
  const failed = error === "true";
  const title = failed ? "Verbindung fehlgeschlagen" : refresh === "true" ? "Link abgelaufen" : "Fast geschafft";
  const body = failed
    ? "Die Verbindung konnte nicht hergestellt werden. Bitte kehre zur Röbel App zurück und starte die Einrichtung unter „Zahlungen“ erneut."
    : refresh === "true"
      ? "Bitte starte die Einrichtung in der App erneut."
      : "Du wirst zur Röbel App zurückgeleitet. Den Status siehst du unter „Zahlungen“.";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{body}</p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
