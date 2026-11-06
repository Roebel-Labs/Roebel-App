import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";
import { confirmLiveSupport } from "@/lib/live/confirm";

export const dynamic = "force-dynamic";

const FALLBACK = "roebel://profile";

// Accepted return targets: an app deep link (roebel://…), or the web landing on our own host
// (fallback for people who paid from a browser). Anything else falls back to the app.
const RETURN_ALLOW = [
  /^roebel:\/\/[A-Za-z0-9/_.\-]{0,200}$/,
  /^https:\/\/(www\.)?roebel\.app\/live\/[a-z0-9-]{1,80}$/,
];

function safeReturnTo(value: string | undefined): string {
  if (!value || value.length > 300) return FALLBACK;
  return RETURN_ALLOW.some((re) => re.test(value)) ? value : FALLBACK;
}

// Stripe Checkout (live support) returns here: ?support_id=…&return_to=roebel://live/<slug>
export default async function LiveSupportReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ support_id?: string; return_to?: string; cancelled?: string }>;
}) {
  const { support_id, return_to, cancelled } = await searchParams;
  const returnTo = safeReturnTo(return_to);
  const isCancelled = cancelled === "true" || cancelled === "1";
  // Settle right here (asks Stripe directly), so the support shows in the chat without waiting for the webhook.
  if (!isCancelled && support_id) await confirmLiveSupport(support_id).catch(() => "error");
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <div className="mb-3 text-4xl" aria-hidden>
          {isCancelled ? "↩︎" : "💙"}
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          {isCancelled ? "Abgebrochen" : "Danke fürs Unterstützen!"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isCancelled
            ? "Es wurde nichts abgebucht. Zurück zum Livestream …"
            : "Zurück zum Livestream …"}
        </p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
