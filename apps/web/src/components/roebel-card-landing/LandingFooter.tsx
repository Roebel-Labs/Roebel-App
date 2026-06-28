import Image from "next/image";
import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";

const productLinks = [
  { href: "/roebel-card", label: "Röbel Card" },
  { href: "/", label: "Veranstaltungen" },
  { href: "/news", label: "Nachrichten" },
  { href: "/about", label: "Über uns" },
];

const legalLinks = [
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/impressum", label: "Impressum" },
  { href: "/agb", label: "AGB" },
  { href: "/support", label: "Support & Feedback" },
];

const socialLinks = [
  { icon: Facebook, href: "https://facebook.com/roebel.app", label: "Facebook" },
  { icon: Instagram, href: "https://instagram.com/roebel.app", label: "Instagram" },
];

export function LandingFooter() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="mb-4 flex items-center">
              <Image
                src="/Logo-new.png"
                alt="Röbel App"
                width={140}
                height={32}
                className="h-8 w-auto object-contain"
              />
            </Link>
            <p className="mb-5 text-sm text-muted-foreground">
              Lokale Veranstaltungen, Nachrichten, Bürgerbus und jetzt: die Röbel
              Card. Eine App für alles in Röbel/Müritz.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-medium text-foreground">Produkt</h3>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-medium text-foreground">Rechtliches</h3>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-medium text-foreground">Kontakt</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <a
                  href="mailto:hello@roebel.app"
                  className="transition-colors hover:text-foreground"
                >
                  hello@roebel.app
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <a
                  href="tel:039931148019"
                  className="transition-colors hover:text-foreground"
                >
                  039931 148019
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Hohe Straße 2<br />
                  17207 Röbel/Müritz
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row">
          <p>© {currentYear} Röbel App. Alle Rechte vorbehalten.</p>
          <p>
            Die Röbel Card befindet sich in Vorbereitung. Start nach Gründung des
            gemeinnützigen Vereins.
          </p>
        </div>
      </div>
    </footer>
  );
}
