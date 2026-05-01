import { ArrowUpRight, Facebook, Instagram } from "lucide-react";

interface SocialChannel {
  href: string;
  label: string;
  handle: string;
  cta: string;
  icon: React.ReactNode;
  brand: string;
}

const CHANNELS: SocialChannel[] = [
  {
    href: "https://facebook.com/roebel.app",
    label: "Facebook",
    handle: "@roebel.app",
    cta: "Folgen",
    icon: <Facebook className="h-6 w-6" strokeWidth={1.6} />,
    brand: "bg-[#1877F2]",
  },
  {
    href: "https://instagram.com/roebel.app",
    label: "Instagram",
    handle: "@roebel.app",
    cta: "Folgen",
    icon: <Instagram className="h-6 w-6" strokeWidth={1.6} />,
    brand: "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]",
  },
];

export function Section9Social() {
  return (
    <section className="bg-card py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-10 max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Soziale Medien
          </p>
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Folgen Sie Röbel in den sozialen Medien.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Updates zur Röbel Card, neue Partner-Geschäfte und Berichte über
            geförderte Vereine — direkt in Ihrem Feed.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {CHANNELS.map((channel) => (
            <a
              key={channel.label}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-3xl border border-border bg-background p-6 shadow-sm transition-shadow hover:shadow-md sm:p-7"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${channel.brand}`}
                >
                  {channel.icon}
                </span>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {channel.label}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {channel.handle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                {channel.cta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
