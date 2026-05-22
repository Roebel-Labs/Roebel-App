import { Briefcase, Car, UtensilsCrossed } from "lucide-react";

const ITEMS = [
  {
    icon: Briefcase,
    label: "Geschäftsreisen",
    accent: "from-primary/30 to-primary/10",
  },
  {
    icon: Car,
    label: "Mitarbeiterfahrten",
    accent: "from-amber-200/60 to-amber-100/30",
  },
  {
    icon: UtensilsCrossed,
    label: "Mitarbeiterprogramme",
    accent: "from-emerald-200/60 to-emerald-100/30",
  },
];

export function UnternehmenLeverage() {
  return (
    <section
      className="bg-card"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-14 md:py-20 lg:py-24">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-foreground">
          So nutzen Unternehmen Röbel
        </h2>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6 lg:gap-10">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex flex-col items-center text-center"
              >
                <div
                  className={`relative aspect-square w-32 sm:w-36 lg:w-40 rounded-full overflow-hidden bg-gradient-to-br ${item.accent} ring-1 ring-border`}
                  aria-hidden
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="h-10 w-10 sm:h-12 sm:w-12 text-foreground/70" />
                  </div>
                </div>
                <div className="mt-4 text-base sm:text-lg font-medium text-foreground">
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
