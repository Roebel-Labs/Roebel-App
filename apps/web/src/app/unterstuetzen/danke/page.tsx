import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";
import { confirmAppSupport } from "@/lib/app-support";

export const dynamic = "force-dynamic";

// Stripe Checkout for "Röbel App unterstützen" returns here, then hands back to the app.
export default async function AppSupportThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; support_id?: string }>;
}) {
  const { cancelled, support_id } = await searchParams;
  const isCancelled = cancelled === "true" || cancelled === "1";
  // Settle right here (asks Stripe directly), so the supporter is on the list when the app opens again.
  if (!isCancelled && support_id) await confirmAppSupport(support_id).catch(() => "error");
  const returnTo = isCancelled
    ? "roebel://unterstuetzen"
    : `roebel://unterstuetzen/danke${support_id && /^[0-9a-f-]{36}$/i.test(support_id) ? `?support_id=${support_id}` : ""}`;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">
          {isCancelled ? "Abgebrochen" : "Danke fürs Unterstützen!"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isCancelled
            ? "Es wurde nichts abgebucht. Zurück zur Röbel App …"
            : "Damit können wir die Röbel App weiter betreiben und verbessern. Zurück zur App …"}
        </p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
