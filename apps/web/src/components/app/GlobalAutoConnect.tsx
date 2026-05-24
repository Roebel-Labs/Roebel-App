"use client";

import { AutoConnect } from "thirdweb/react";
import { client } from "@/app/client";
import { wallets } from "@/lib/wallet-config";

export function GlobalAutoConnect() {
  return <AutoConnect client={client} wallets={wallets} />;
}
