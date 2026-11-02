import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";
import { SPONSORING_RETURN_ALLOW } from "@/lib/sponsoring";

const FALLBACK = "roebel://profile";

// Stripe Checkout returns here, then hands back to the app's sponsoring page. Only the deep link
// checkout builds (roebel://org/sponsoring/<slug>) is accepted for ?return_to=.
export default async function SponsoringReturnPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; return_to?: string }> }) {
  const { cancelled, return_to } = await searchParams;
  const returnTo = return_to && SPONSORING_RETURN_ALLOW.test(return_to) ? return_to : FALLBACK;
  const isCancelled = cancelled === "true";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">{isCancelled ? "Zahlung abgebrochen" : "Ihr seid dabei!"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isCancelled ? "Es wurde nichts abgebucht." : "Danke! Die Rechnung kommt per E-Mail. Zurück in die App …"}
        </p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
