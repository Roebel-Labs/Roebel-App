import type { Metadata } from "next";
import { monaSans, monaSansMono } from "./fonts";
import "./globals.css";
import { ThirdwebProvider } from "thirdweb/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { ConditionalFooter } from "@/components/layout/ConditionalFooter";
import { GlobalWalletRedirect } from "@/components/app/GlobalWalletRedirect";
import { GlobalAutoConnect } from "@/components/app/GlobalAutoConnect";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccountProvider } from "@/lib/context/AccountContext";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "Röbel App",
  description:
    "Veranstaltungen, Neuigkeiten und Kinoprogramm aus Röbel",
  icons: {
    icon: [
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "android-chrome", url: "/favicon/android-chrome-192x192.png", sizes: "192x192" },
      { rel: "android-chrome", url: "/favicon/android-chrome-512x512.png", sizes: "512x512" },
    ],
  },
  manifest: "/favicon/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${monaSans.variable} ${monaSansMono.variable}`} suppressHydrationWarning>
      <body className={`${monaSans.className} flex flex-col min-h-screen overflow-x-hidden`}>
        <ThemeProvider>
          <ThirdwebProvider>
            <GlobalAutoConnect />
            <AccountProvider>
              <GlobalWalletRedirect />
              <div className="flex-1">{children}</div>
              <ConditionalFooter />
              <Toaster />
              <Sonner position="top-right" richColors />
              <Analytics />
            </AccountProvider>
          </ThirdwebProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
