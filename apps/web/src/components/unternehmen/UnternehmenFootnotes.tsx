export function UnternehmenFootnotes() {
  return (
    <section
      className="bg-card border-t border-border"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-8 md:py-10">
        <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <p>
            Verfügbarkeit von Produkten und Funktionen kann je nach Region und
            Standort variieren. Mehr erfahren — <a href="#" className="underline hover:text-foreground">hier</a>.
          </p>
          <p>
            <sup>1</sup> Basiert auf einer Befragung von Röbel-Geschäftskunden im
            Februar 2026. Teilnehmende Unternehmen gaben an, Kosten für lokale
            Beschaffung durch verbesserte Compliance reduziert zu haben.
          </p>
          <p>
            <sup>2</sup> Lokale Lieferanten und Partnerangebote sind in
            bestimmten Quartieren verfügbar. Außerhalb der Innenstadt kann die
            Verfügbarkeit eingeschränkt sein.
          </p>
          <p>
            <sup>3</sup> Basiert auf einer im Herbst 2025 von Röbel
            beauftragten Befragung. 75 % aller befragten Kunden (von 8.305
            insgesamt) gaben an, Röbel für Unternehmen Kolleg:innen oder
            Bekannten aus ihrem beruflichen Netzwerk weiterzuempfehlen.
          </p>
          <p>
            * Ihre Organisation erhält bis zu 20 € Röbel-Guthaben für jede 200 €,
            die im Rahmen aktiver Programme während des Förderzeitraums
            ausgegeben werden. Max. 100 € Guthaben pro Konto. Zusätzliche
            Bedingungen gelten.
          </p>
        </div>
      </div>
    </section>
  );
}
