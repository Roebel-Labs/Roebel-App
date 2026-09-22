import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";

const FALLBACK = "roebel://tickets";
const ALLOW = /^(roebel:\/\/|https:\/\/(www\.)?roebel\.app\/)/;

export default async function TicketsReturnPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; return_to?: string }> }) {
  const { cancelled, return_to } = await searchParams;
  const returnTo = return_to && ALLOW.test(return_to) ? return_to : FALLBACK;
  const isCancelled = cancelled === "true";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">{isCancelled ? "Zahlung abgebrochen" : "Vielen Dank!"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isCancelled ? "Es wurde nichts abgebucht." : "Deine Tickets erscheinen gleich in der App."}
        </p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
