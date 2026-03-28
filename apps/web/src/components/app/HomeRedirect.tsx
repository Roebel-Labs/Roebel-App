"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount, useIsAutoConnecting } from "thirdweb/react";

export function HomeRedirect() {
  const router = useRouter();
  const account = useActiveAccount();
  const isAutoConnecting = useIsAutoConnecting();

  useEffect(() => {
    if (!isAutoConnecting && account) {
      router.replace("/app");
    }
  }, [isAutoConnecting, account, router]);

  return null;
}
