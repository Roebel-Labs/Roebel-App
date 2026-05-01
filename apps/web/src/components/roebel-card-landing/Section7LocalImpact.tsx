import { Building2, Users } from "lucide-react";

const PLACEHOLDER_VEREINE = [
  "TSV Müritz Röbel",
  "Karnevalsverein Röbel",
  "Bürgerbus Elli e. V.",
  "Heimatverein Röbel",
  "Müritz Saga e. V.",
  "Freiwillige Feuerwehr",
];

const PLACEHOLDER_GESCHAEFTE = [
  "Bäckerei am Markt",
  "Buchhandlung Röbel",
  "Café Müritz",
  "Optiker Wolter",
  "Müritz-Apotheke",
  "Hotel am Hafen",
];

export function Section7LocalImpact() {
  return (
    <section className="bg-card py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Lokale Wirkung
          </p>
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Könnte jährlich über 100.000 € erwirtschaften.
          </h2>
          <p className="mt-5 text-balance text-base text-muted-foreground sm:text-lg">
            Die Röbel Card kann zur Drehscheibe für lokale Wertschöpfung werden —
            durch den steuerfreien Sachbezug für Mitarbeitende und die 5 %
            Vereinsförderung aus jeder Transaktion.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Annahme:</span> ca.
            200 Beschäftigte in Röbeler Betrieben schöpfen den 50-€-Sachbezug pro
            Monat (§ 8 Abs. 2 Satz 11 EStG) aus.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Beschäftigte" value="200" />
            <Stat label="Monatlich pro Person" value="50 €" />
            <Stat label="Jährlich in Röbel" value="120.000 €" emphasis />
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Plus 5 % Vereinsförderung aus jeder Transaktion — fließt direkt an
            gemeinnützige Vereine vor Ort.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
          <LogoWall
            title="Vereine, die profitieren würden"
            icon={<Users className="h-4 w-4" />}
            items={PLACEHOLDER_VEREINE}
          />
          <LogoWall
            title="Geschäfte, die teilnehmen könnten"
            icon={<Building2 className="h-4 w-4" />}
            items={PLACEHOLDER_GESCHAEFTE}
          />
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
          Beispielhafte Auswahl. Die finale Liste der teilnehmenden Vereine und
          Geschäfte entsteht gemeinsam mit den Akteuren in Röbel.
        </p>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-muted/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={
          emphasis
            ? "mt-1 text-2xl font-semibold tracking-tight text-primary"
            : "mt-1 text-2xl font-semibold tracking-tight text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function LogoWall({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div className="rounded-3xl border border-border bg-background p-6">
      <div className="mb-5 flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {title}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((name) => (
          <li
            key={name}
            className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground sm:text-sm"
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary/40" />
            <span className="truncate">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
