import { InterestCTAButtons } from "./InterestCTAButtons";

export function Section2Outro() {
  return (
    <section className="relative bg-background py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Die Röbel Card vereinfacht Ihr Einkaufserlebnis bei den meisten
            Geschäften mit hohen Akzeptanzraten.
          </h2>
          <div className="mx-auto mt-8 flex max-w-md justify-center">
            <InterestCTAButtons citizenOnly layout="row" />
          </div>
        </div>
      </div>
    </section>
  );
}
