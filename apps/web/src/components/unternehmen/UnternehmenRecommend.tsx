import { ConnectCta } from "./ConnectCta";

export function UnternehmenRecommend() {
  return (
    <section
      className="bg-primary text-primary-foreground"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-14 md:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-tight max-w-3xl mx-auto">
          3 von 4 Unternehmen würden Röbel<br className="hidden sm:block" /> weiterempfehlen.
          <sup className="text-base align-super ml-0.5">3</sup>
        </h2>
        <div className="mt-7 flex justify-center">
          <ConnectCta
            label="Jetzt starten"
            variant="primary-light"
            title="Bei Röbel anmelden"
          />
        </div>
      </div>
    </section>
  );
}
