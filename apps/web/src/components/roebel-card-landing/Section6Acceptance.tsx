import { CardArt } from "./CardArt";
import { InterestCTAButtons } from "./InterestCTAButtons";

export function Section6Acceptance() {
  return (
    <section className="relative overflow-hidden bg-background py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(121,159,220,0.18) 0%, rgba(121,159,220,0.05) 40%, transparent 75%)",
        }}
      />
      <div className="container mx-auto px-4">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-10 w-full max-w-xs sm:max-w-sm">
            <CardArt />
          </div>

          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Über 30 potentielle Akzeptanzstellen.
            <br />
            Eine Karte.
          </h2>
          <p className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Sobald die Röbel Card startet, soll sie bei den meisten Röbeler
            Geschäften funktionieren — vorausgesetzt, sie sind dabei. Sie
            betreiben ein lokales Geschäft? Wir freuen uns auf Sie.
          </p>

          <div className="mt-8 w-full max-w-md">
            <InterestCTAButtons />
          </div>
        </div>
      </div>
    </section>
  );
}
