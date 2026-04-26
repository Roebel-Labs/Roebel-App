import Link from "next/link";
import { Mail, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getExternStatus } from "@/app/actions/extern-accounts";

export const dynamic = "force-dynamic";

export default async function ExternPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const status = email ? await getExternStatus(email) : null;

  const flavor =
    status?.status === "approved"
      ? "approved"
      : status?.status === "rejected"
      ? "rejected"
      : "pending";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-lg text-center space-y-6 bg-card border border-border rounded-[10px] p-8">
        {flavor === "approved" ? (
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
        ) : flavor === "rejected" ? (
          <XCircle className="h-12 w-12 mx-auto text-red-500" />
        ) : (
          <Hourglass className="h-12 w-12 mx-auto text-amber-500" />
        )}

        <h1 className="text-2xl font-medium">
          {flavor === "approved"
            ? "Konto freigegeben"
            : flavor === "rejected"
            ? "Antrag abgelehnt"
            : "Antrag wird geprüft"}
        </h1>

        <p className="text-sm text-muted-foreground">
          {flavor === "approved"
            ? `Dein Konto „${status?.name ?? ""}" ist freigegeben. Du kannst jetzt veröffentlichen.`
            : flavor === "rejected"
            ? `Dein Antrag für „${status?.name ?? ""}" wurde leider abgelehnt.`
            : "Wir prüfen deinen Antrag und melden uns per E-Mail. Das dauert in der Regel 1–3 Werktage."}
        </p>

        {email && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            {email}
          </p>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          {flavor === "approved" ? (
            <Button asChild>
              <Link href="/app/org-dashboard">Zum Dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/">Zurück zur Startseite</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
