"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

const faqs = [
  {
    question: "Was kostet die Registrierung?",
    answer:
      "Die Registrierung und das Gewerbeprofil sind komplett kostenlos. Sie können unbegrenzt Angebote erstellen und im Verzeichnis erscheinen. Optionale Premium-Funktionen wie hervorgehobene Platzierung werden in Zukunft als Zusatzoptionen angeboten.",
  },
  {
    question: "Wie melde ich mein Gewerbe an?",
    answer:
      'Klicken Sie auf "Kostenlos registrieren", verbinden Sie Ihre Wallet und füllen Sie das Anmeldeformular aus. Geben Sie Ihren Firmennamen, Kategorie, Kontaktdaten und Öffnungszeiten an. Sie können auch ein Logo und Bilder hochladen.',
  },
  {
    question: "Wie funktioniert der Genehmigungsprozess?",
    answer:
      "Nach der Einreichung wird Ihr Gewerbeprofil von unserem Team geprüft. Die Prüfung dauert in der Regel 1–2 Werktage. Sie werden benachrichtigt, sobald Ihr Profil genehmigt wurde.",
  },
  {
    question: "Wie funktionieren die lokalen Anzeigen?",
    answer:
      'Nach der Genehmigung Ihres Profils können Sie Angebote (Rabatte, Aktionen, Events, Neuheiten) erstellen. Diese erscheinen auf Ihrer Gewerbeseite und auf der "Lokale Angebote"-Seite, die von allen Bürgern der App eingesehen werden kann.',
  },
  {
    question: "Wer kann ein Gewerbe registrieren?",
    answer:
      "Jeder Nutzer mit einem Wallet-Konto kann ein Gewerbe registrieren. Es spielt keine Rolle, ob Sie bereits als Bürger, Tourist oder Unternehmer registriert sind. Sie behalten Ihren bestehenden Zugang und können zusätzlich Ihr Gewerbe verwalten.",
  },
  {
    question: "Was passiert nach der Genehmigung?",
    answer:
      "Nach der Genehmigung erscheint Ihr Gewerbe sofort im öffentlichen Gewerbe-Verzeichnis. Sie können Angebote erstellen, Ihr Profil bearbeiten und die Statistiken Ihrer Anzeigen einsehen.",
  },
]

export function BusinessLandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Häufige Fragen</h2>
        </div>

        <div className="max-w-2xl mx-auto space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <span className="font-medium text-foreground text-sm pr-4">{faq.question}</span>
                <ChevronDown
                  className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
