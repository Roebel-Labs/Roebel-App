import Link from "next/link"
import { redirect } from "next/navigation"
import { unsubscribeByToken } from "@/app/actions/newsletter-public"

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const { token, done } = await searchParams

  async function handleUnsubscribe(formData: FormData) {
    "use server"
    const t = String(formData.get("token") ?? "")
    const result = await unsubscribeByToken(t)
    redirect(`/newsletter/abmelden?token=${encodeURIComponent(t)}&done=${result.success ? "1" : "0"}`)
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      {done === "1" ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Abgemeldet</h1>
          <p className="mt-3 text-gray-600">
            Du erhältst ab sofort keinen Röbel-Newsletter mehr. Schade — du kannst dich
            jederzeit wieder anmelden.
          </p>
        </>
      ) : done === "0" || !token ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Link ungültig</h1>
          <p className="mt-3 text-gray-600">Dieser Abmelde-Link ist ungültig.</p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-gray-900">Newsletter abbestellen</h1>
          <p className="mt-3 text-gray-600">
            Möchtest du den wöchentlichen Röbel-Newsletter wirklich nicht mehr erhalten?
          </p>
          <form action={handleUnsubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="rounded-xl bg-[#00498B] px-6 py-3 font-semibold text-white hover:bg-[#003a70]"
            >
              Ja, abmelden
            </button>
          </form>
        </>
      )}
      <Link href="/newsletter" className="mt-6 inline-block text-[#00498B] underline">
        Zur Newsletter-Seite
      </Link>
    </main>
  )
}
