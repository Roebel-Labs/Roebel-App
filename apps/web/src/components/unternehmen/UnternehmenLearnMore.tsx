import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ARTICLES = [
  {
    title: "So reduzieren Sie den CO₂-Fußabdruck Ihrer Geschäftsreisen",
    cta: "Mehr erfahren",
    href: "/about",
    swatch: "from-emerald-200/60 to-emerald-100/20",
  },
  {
    title: "Welche Zusatzleistungen Ihre Mitarbeitenden heute erwarten",
    cta: "Lesen",
    href: "/about",
    swatch: "from-amber-200/60 to-amber-100/20",
  },
  {
    title:
      "Der Weg zu Netto-Null: Führungskräfte über lokale Klimastrategien",
    cta: "Weiterlesen",
    href: "/about",
    swatch: "from-sky-200/60 to-sky-100/20",
  },
];

export function UnternehmenLearnMore() {
  return (
    <section
      className="bg-card"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-14 md:py-20 lg:py-24">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-foreground">
          Mehr erfahren?
        </h2>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {ARTICLES.map((article) => (
            <Link
              key={article.title}
              href={article.href}
              className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md"
            >
              <div
                className={`aspect-[16/10] w-full bg-gradient-to-br ${article.swatch} ring-1 ring-inset ring-border`}
                aria-hidden
              />
              <div className="p-5 flex flex-col gap-3 flex-1">
                <h3 className="text-base sm:text-lg font-semibold text-foreground leading-snug">
                  {article.title}
                </h3>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  {article.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
