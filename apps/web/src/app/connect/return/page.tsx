import { SuccessRedirect } from "@/app/roebel-card/success/success-redirect";

const FALLBACK = "roebel://org/payments";
const ALLOW = /^(roebel:\/\/|https:\/\/(www\.)?roebel\.app\/)/;

export default async function ConnectReturnPage({ searchParams }: { searchParams: Promise<{ return_to?: string; refresh?: string }> }) {
  const { return_to, refresh } = await searchParams;
  const returnTo = return_to && ALLOW.test(return_to) ? return_to : FALLBACK;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-2">{refresh === "true" ? "Link abgelaufen" : "Fast geschafft"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {refresh === "true" ? "Bitte starte die Einrichtung in der App erneut." : "Du wirst zur Röbel App zurückgeleitet. Den Status siehst du unter „Zahlungen“."}
        </p>
        <SuccessRedirect returnTo={returnTo} />
      </div>
    </div>
  );
}
