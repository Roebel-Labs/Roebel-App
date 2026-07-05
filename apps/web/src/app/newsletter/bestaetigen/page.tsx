import Link from "next/link"
import { confirmSubscription } from "@/app/actions/newsletter-public"

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const result = token ? await confirmSubscription(token) : { success: false }
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      {result.success ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Willkommen an Bord! 🎉</h1>
          <p className="mt-3 text-gray-600">
            Deine Anmeldung ist bestätigt. Der nächste Röbel-Newsletter landet bald in deinem Postfach.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Link ungültig</h1>
          <p className="mt-3 text-gray-600">
            Dieser Bestätigungslink ist ungültig oder abgelaufen. Melde dich einfach erneut an.
          </p>
        </>
      )}
      <Link href="/newsletter" className="mt-6 inline-block text-[#00498B] underline">
        Zur Newsletter-Seite
      </Link>
    </main>
  )
}
