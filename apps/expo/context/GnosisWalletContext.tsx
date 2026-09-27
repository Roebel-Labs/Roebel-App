import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Account } from "thirdweb/wallets";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { isPasskeyWallet } from "@/lib/passkey/active";
import { client } from "@/constants/thirdweb";
import { gnosisWallet } from "@/constants/wallets";

interface GnosisWalletValue {
	/** The user's smart account on Gnosis (same login + address as Base). */
	gnosisAccount: Account | null;
	gnosisAddress: string | null;
	/** True once the Gnosis auto-connect attempt has settled. */
	ready: boolean;
}

const GnosisWalletContext = createContext<GnosisWalletValue | undefined>(undefined);

/**
 * Connects a parallel Gnosis smart account from the SAME in-app login (auto-connect
 * reuses the stored session — no second login). Gated on the Base account being
 * present so we only attempt it once the user is authenticated. Powers Röbel Münzen
 * (Circles) on Gnosis with gasless (sponsored) transactions.
 */
export function GnosisWalletProvider({ children }: { children: React.ReactNode }) {
	const baseAccount = useActiveAccount();
	const activeWallet = useActiveWallet();
	// A passkey session (wallet id "adapter") already IS the Gnosis account: every write must go
	// through the passkey Safe, never through a thirdweb login that may still sit on the device.
	const passkey = isPasskeyWallet(activeWallet);
	const [gnosisAccount, setGnosisAccount] = useState<Account | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!baseAccount?.address) {
				setGnosisAccount(null);
				return;
			}
			if (passkey) {
				setGnosisAccount(baseAccount);
				setReady(true);
				return;
			}
			try {
				const acc = await gnosisWallet.autoConnect({ client });
				if (!cancelled) setGnosisAccount(acc ?? null);
			} catch {
				// No shared session yet / restore failed — Gnosis features stay gated.
				if (!cancelled) setGnosisAccount(null);
			} finally {
				if (!cancelled) setReady(true);
			}
		})();
		return () => { cancelled = true; };
	}, [baseAccount?.address, passkey]);

	const value = useMemo<GnosisWalletValue>(
		() => ({ gnosisAccount, gnosisAddress: gnosisAccount?.address ?? null, ready }),
		[gnosisAccount, ready],
	);

	return <GnosisWalletContext.Provider value={value}>{children}</GnosisWalletContext.Provider>;
}

export function useGnosisWallet(): GnosisWalletValue {
	const ctx = useContext(GnosisWalletContext);
	if (!ctx) throw new Error("useGnosisWallet must be used within GnosisWalletProvider");
	return ctx;
}
