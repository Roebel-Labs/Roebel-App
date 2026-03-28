"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    question: "Wie kann ich Tickets kaufen?",
    answer:
      "Vorverkauf möglich bei MüritzPhone und Optiker Wolter. Sie können Tickets auch direkt über unsere Website kaufen.",
  },
  {
    question: "Wann findet die Veranstaltung statt?",
    answer:
      "Die MV Boxen Landesmeisterschaft findet am 7. und 8. März 2026 statt. Beginn ist um 12 Uhr.",
  },
  {
    question: "Gibt es einen Livestream?",
    answer:
      "Ja, wir bieten einen professionellen Livestream der gesamten Veranstaltung an. Mit einem Ticket können Sie alle Kämpfe live von überall aus verfolgen.",
  },
  {
    question: "Wie erreiche ich den Veranstaltungsort?",
    answer:
      "Der Veranstaltungsort ist die Turnhalle am Gotthunskamp in Röbel/Müritz. Beginn ist um 12 Uhr. Parkplätze sind vor Ort verfügbar.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="bg-[#000] py-12 md:py-24">
      <div className="mx-auto max-w-3xl px-6 md:px-12 lg:px-20">
        {/* Section Header */}
        <div className="mb-8 text-center md:mb-12">
          <h2 className="text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
            Häufig gestellte Fragen
          </h2>
          <p className="mt-3 text-sm text-gray-400 md:text-base">
            Hier finden Sie Antworten auf die wichtigsten Fragen
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-3 md:space-y-4">
          {faqItems.map((item, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50"
            >
              {/* Question */}
              <button
                onClick={() => toggleItem(index)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-800/50 md:p-5"
              >
                <span className="pr-4 text-sm font-semibold text-white md:text-base">
                  {item.question}
                </span>
                <span className="flex-shrink-0 text-gray-400">
                  {openIndex === index ? (
                    <Minus className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </span>
              </button>

              {/* Answer */}
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? "max-h-96" : "max-h-0"
                }`}
              >
                <div className="border-t border-gray-800 p-4 md:p-5">
                  <p className="text-sm text-gray-400 md:text-base">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
