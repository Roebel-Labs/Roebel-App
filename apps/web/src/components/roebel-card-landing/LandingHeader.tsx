import Image from "next/image";
import Link from "next/link";

import { InterestCTAButtons } from "./InterestCTAButtons";

export function LandingHeader() {
  return (
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

        <InterestCTAButtons citizenOnly layout="row-compact" />
      </div>
    </header>
  );
}
