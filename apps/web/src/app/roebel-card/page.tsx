import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Röbel Card — In Arbeit",
  description:
    "Die Röbel Card Infoseite befindet sich derzeit in Arbeit. Schau bald wieder vorbei.",
};

export default function RoebelCardLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/Logo-new.png"
              alt="Röbel App"
              width={122}
              height={28}
              className="h-7 w-auto object-contain"
              priority
            />
            <span className="border-l border-border pl-2.5 text-sm font-semibold text-foreground">
              Card
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex max-w-md flex-col items-center text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            🚧 In Arbeit
          </span>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Diese Seite entsteht gerade
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
            Wir arbeiten mit Hochdruck an der Infoseite zur Röbel Card. Schau
            bald wieder vorbei – hier erfährst du in Kürze alles über die Karte
            für lokalen Handel und Vereine in Röbel/Müritz.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-[#00498B] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00498B]/90"
          >
            Zurück zur Startseite
          </Link>
        </div>
      </main>
    </div>
  );
}
