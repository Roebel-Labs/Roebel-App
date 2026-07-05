import type { Metadata } from "next"
import { NewsletterSignupForm } from "./signup-form"

export const metadata: Metadata = {
  title: "Newsletter | Röbel App",
  description: "Jede Woche die wichtigsten Neuigkeiten aus Röbel/Müritz ins Postfach.",
}

export default function NewsletterPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Der Röbel-Newsletter</h1>
      <p className="mt-3 text-gray-600">
        Einmal pro Woche: Neuigkeiten, Veranstaltungen, Abstimmungen und alles, was in
        Röbel/Müritz passiert. Kostenlos, jederzeit abbestellbar.
      </p>
      <div className="mt-8">
        <NewsletterSignupForm />
      </div>
    </main>
  )
}
