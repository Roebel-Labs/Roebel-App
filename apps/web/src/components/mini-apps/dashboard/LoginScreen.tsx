"use client";

// Dark full-viewport login for the mini-app dashboard: floating app-icon
// tiles left and right (gently animated), a centered connect card, dotted
// ground pattern. Shown whenever /dashboard/mini-apps is opened without a
// connected wallet.
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BarChart3,
  Code2,
  ImageIcon,
  Megaphone,
  Settings,
  TrendingUp,
  Wallet,
  Watch,
} from "lucide-react";
import { ConnectButton, useIsAutoConnecting } from "thirdweb/react";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { wallets } from "@/lib/wallet-config";

type Float = {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
  x: string;
  y: string;
  delay: number;
};

// Positions are viewport-relative; tiles hide on small screens.
const LEFT: Float[] = [
  { label: "▲ 61 %", x: "18%", y: "22%", delay: 0 },
  { icon: ImageIcon, x: "14%", y: "33%", delay: 1.2 },
  { icon: Wallet, x: "18%", y: "44%", delay: 2.1 },
  { icon: BarChart3, x: "13%", y: "55%", delay: 0.6 },
  { icon: Award, x: "20%", y: "61%", delay: 1.7 },
];
const RIGHT: Float[] = [
  { icon: Watch, x: "82%", y: "26%", delay: 0.9 },
  { icon: Settings, x: "76%", y: "34%", delay: 0 },
  { label: "▲ 85 %", x: "80%", y: "44%", delay: 1.5 },
  { icon: Code2, x: "83%", y: "54%", delay: 2.4 },
  { icon: Megaphone, x: "76%", y: "60%", delay: 0.4 },
];

function FloatTile({ item }: { item: Float }) {
  const Icon = item.icon;
  return (
    <div
      aria-hidden
      className="dash-float absolute hidden lg:block"
      style={{ left: item.x, top: item.y, animationDelay: `${item.delay}s` }}
    >
      {Icon ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06] shadow-lg">
          <Icon className="h-5 w-5 text-white/85" />
        </span>
      ) : (
        <span className="flex h-10 items-center rounded-full border border-white/10 bg-white/[0.06] px-4 font-mono text-sm font-semibold text-white/90 shadow-lg">
          {item.label}
        </span>
      )}
    </div>
  );
}

export function LoginScreen() {
  const autoConnecting = useIsAutoConnecting();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0A0A0A] text-white">
      <style>{`
        @keyframes dash-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .dash-float { animation: dash-float 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dash-float { animation: none; }
        }
      `}</style>

      {LEFT.map((f) => (
        <FloatTile key={`${f.x}${f.y}`} item={f} />
      ))}
      {RIGHT.map((f) => (
        <FloatTile key={`${f.x}${f.y}`} item={f} />
      ))}

      {/* Dotted ground */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1.5px, transparent 1.5px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(to top, rgba(0,0,0,.6), transparent)",
          WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,.6), transparent)",
        }}
      />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl">
            <div className="p-8 sm:p-10">
              <Image
                src="/logo.png"
                alt="Röbel App"
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
              />
              <h1 className="mt-5 font-heading text-3xl font-bold">Mini-App Dashboard</h1>
              <p className="mt-2 text-sm text-white/60">
                Melde dich an, um deine Mini-Apps zu verwalten, zu veröffentlichen und
                ihre Nutzung zu sehen.
              </p>
              <div className="mt-6">
                <ConnectButton
                  client={client}
                  chain={activeChain}
                  wallets={wallets}
                  autoConnect
                  connectButton={{
                    label: autoConnecting ? "Verbinde …" : "Anmelden",
                    style: {
                      width: "100%",
                      backgroundColor: "#ffffff",
                      color: "#0A0A0A",
                      borderRadius: "9999px",
                      fontWeight: 700,
                      height: "52px",
                    },
                  }}
                  connectModal={{ title: "Mini-App Dashboard", size: "compact" }}
                  theme="dark"
                />
              </div>
              <div className="mt-5 text-center">
                <Link
                  href="/dashboard/mini-apps/rankings"
                  className="text-sm font-semibold text-white/90 hover:underline"
                >
                  Beliebte Apps ansehen
                </Link>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[0.03] px-8 py-4 text-center text-xs text-white/50">
              Kein Konto? Beim Anmelden wird automatisch eins für dich erstellt.
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-4 pb-8 text-xs text-white/50">
        <a href="mailto:support@roebel.app" className="hover:text-white/80">
          Support
        </a>
        <span aria-hidden>•</span>
        <Link href="/impressum" className="hover:text-white/80">
          Impressum
        </Link>
        <span aria-hidden>•</span>
        <Link href="/datenschutz" className="hover:text-white/80">
          Datenschutz
        </Link>
      </footer>
    </div>
  );
}
