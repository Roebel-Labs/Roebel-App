"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Ist mein Geld sicher?",
    answer:
      "Ja. Ihr Guthaben liegt 1:1 gedeckt auf einem Treuhandkonto des gemeinnützigen Vereins. Es ist jederzeit auszahlbar und insolvenzgeschützt vom Vereinsvermögen getrennt.",
  },
  {
    question: "Kostet das was?",
    answer:
      "Für Bürger: nein — keine Aufladegebühr, kein Monatsbeitrag. Für Händler: noch in Abstimmung, aber bewusst niedriger als klassische Kartengebühren.",
  },
  {
    question: "Was passiert, wenn ich umziehe?",
    answer:
      "Sie können Ihr Restguthaben jederzeit auf Ihr Originalkonto zurückerstatten lassen — auch nach einem Umzug.",
  },
  {
    question: "Brauche ich ein Smartphone?",
    answer:
      "In Phase 1 ja — die Karte läuft über die Röbel App. Eine physische Karte ist später denkbar, sobald genug Bedarf besteht.",
  },
  {
    question: "Was ist mit meinen Daten?",
    answer:
      "DSGVO-konform, Hosting in Frankfurt am Main. Keine Weitergabe an Dritte für Werbezwecke.",
  },
  {
    question: "Wie ist das mit der BaFin?",
    answer:
      "Wir nutzen die Limited-Network-Ausnahme nach § 2 Abs. 1 Nr. 10 ZAG — die Karte ist kein E-Geld und nur bei eng begrenzten Akzeptanzstellen in Röbel einlösbar.",
  },
  {
    question: "Was hat das mit der Röbel App zu tun?",
    answer:
      "Die Röbel Card ist Teil der bestehenden Röbel App — ein Login, eine Identität, alles an einem Ort.",
  },
];

export function Section10FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [isAndroidOpen, setIsAndroidOpen] = useState(false);
  const [isIOSOpen, setIsIOSOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const toggle = (index: number) =>
    setOpenIndex(openIndex === index ? null : index);

  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
          {/* Left — Heading + QR download */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Geld, das lokal bleibt
            </p>
            <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Geld, das Schritt hält.
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Von Ausgaben bis Abhebungen — die Röbel Card lässt Ihr Geld dort,
              wo Sie es brauchen.
            </p>

            <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="mb-4 text-sm font-medium text-foreground">
                Röbel App herunterladen
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {isMobile ? (
                  <a
                    href="https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain&hl=de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative h-12 cursor-pointer transition-opacity hover:opacity-80"
                  >
                    <Image
                      src="/GetItOnGooglePlay_Badge_Web_color_German.png"
                      alt="Jetzt bei Google Play"
                      width={135}
                      height={48}
                      className="h-12 w-auto"
                    />
                  </a>
                ) : (
                  <button
                    onClick={() => setIsAndroidOpen(true)}
                    className="relative h-12 cursor-pointer transition-opacity hover:opacity-80"
                  >
                    <Image
                      src="/GetItOnGooglePlay_Badge_Web_color_German.png"
                      alt="Jetzt bei Google Play"
                      width={135}
                      height={48}
                      className="h-12 w-auto"
                    />
                  </button>
                )}

                {isMobile ? (
                  <a
                    href="https://apps.apple.com/de/app/r%C3%B6bel/id6754984699"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative h-12 cursor-pointer transition-opacity hover:opacity-80"
                  >
                    <Image
                      src="/Download_on_the_App_Store_Badge_DK_RGB_blk_100217.svg"
                      alt="Download on the App Store"
                      width={120}
                      height={48}
                      className="h-12 w-auto"
                    />
                  </a>
                ) : (
                  <button
                    onClick={() => setIsIOSOpen(true)}
                    className="relative h-12 cursor-pointer transition-opacity hover:opacity-80"
                  >
                    <Image
                      src="/Download_on_the_App_Store_Badge_DK_RGB_blk_100217.svg"
                      alt="Download on the App Store"
                      width={120}
                      height={48}
                      className="h-12 w-auto"
                    />
                  </button>
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Klicken Sie auf einen Badge, um den QR-Code zu scannen — oder
                öffnen Sie diese Seite direkt am Smartphone.
              </p>
            </div>
          </div>

          {/* Right — FAQ accordion */}
          <div>
            <p className="mb-5 text-sm font-medium text-foreground">
              Häufig gestellte Fragen
            </p>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, index) => {
                const isOpen = openIndex === index;
                return (
                  <div
                    key={item.question}
                    className="overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-muted/50"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold text-foreground sm:text-base">
                        {item.question}
                      </span>
                      <span className="flex-shrink-0 text-muted-foreground">
                        {isOpen ? (
                          <Minus className="h-5 w-5" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </span>
                    </button>
                    <div
                      className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ${
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="min-h-0">
                        <p className="border-t border-border p-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
                          {item.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isAndroidOpen} onOpenChange={setIsAndroidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Röbel App auf Android</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-center text-muted-foreground">
              Scannen Sie den QR-Code, um die App auf Android herunterzuladen.
            </p>
            <div className="relative h-64 w-64">
              <Image src="/qr-android.png" alt="Android QR Code" fill className="object-contain" />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isIOSOpen} onOpenChange={setIsIOSOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Röbel App auf iOS</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-center text-muted-foreground">
              Scannen Sie den QR-Code, um die App auf iOS herunterzuladen.
            </p>
            <div className="relative h-64 w-64">
              <Image src="/qr-ios.png" alt="iOS QR Code" fill className="object-contain" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
