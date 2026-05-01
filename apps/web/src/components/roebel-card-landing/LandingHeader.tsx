import Image from "next/image";
import Link from "next/link";

import { InterestCTAButtons } from "./InterestCTAButtons";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Röbel App Logo"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">Röbel Card</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Powered by Röbel App
            </span>
          </div>
        </Link>

        <InterestCTAButtons citizenOnly layout="row-compact" />
      </div>
    </header>
  );
}
