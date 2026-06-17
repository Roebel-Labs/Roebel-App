import { useCallback, useEffect, useState } from "react";
import { sendTransaction } from "thirdweb";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import { supabase } from "@/lib/supabase";
import {
	isOnboarded,
	getRoebelTalerBalance,
	formatTaler,
	prepareDailyMint,
	prepareOnboard,
} from "@/lib/roebel-taler";

/**
 * Real on-chain Röbel-Taler (Circles on Gnosis), via the parallel Gnosis smart
 * account (gasless / sponsored). Keeps currency logic out of RewardsContext (which
 * stays the off-chain gamification points). User-facing term is always "Röbel-Taler".
 */
export function useRoebelTaler() {
	const { gnosisAccount, ready } = useGnosisWallet();
	const address = gnosisAccount?.address;

	const [balanceRaw, setBalanceRaw] = useState<bigint>(0n);
	const [onboarded, setOnboarded] = useState(false);
	const [loading, setLoading] = useState(true);
	const [minting, setMinting] = useState(false);
	const [onboarding, setOnboarding] = useState(false);

	const refresh = useCallback(async () => {
		if (!address) { setLoading(false); return; }
		setLoading(true);
		try {
			const [ob, bal] = await Promise.all([
				isOnboarded(address).catch(() => false),
				getRoebelTalerBalance(address).catch(() => 0n),
			]);
			setOnboarded(ob);
			setBalanceRaw(bal);
		} finally {
			setLoading(false);
		}
	}, [address]);

	useEffect(() => { refresh(); }, [refresh]);

	const dailyMint = useCallback(async () => {
		if (!gnosisAccount) throw new Error("Gnosis-Konto noch nicht bereit");
		setMinting(true);
		try {
			await sendTransaction({ account: gnosisAccount, transaction: prepareDailyMint() });
			await refresh();
		} finally {
			setMinting(false);
		}
	}, [gnosisAccount, refresh]);

	/**
	 * Onboard the citizen: the server-held Röbel operator trusts this address (the
	 * Circles invitation), then we register on-chain (gasless). After this the
	 * citizen can mint their daily Röbel-Taler.
	 */
	const onboard = useCallback(async () => {
		if (!gnosisAccount) throw new Error("Gnosis-Konto noch nicht bereit");
		setOnboarding(true);
		try {
			const { data, error } = await supabase.functions.invoke("circles-invite", {
				body: { gnosisAddress: gnosisAccount.address },
			});
			if (error) throw error;
			if (!data?.alreadyRegistered && data?.inviter) {
				await sendTransaction({ account: gnosisAccount, transaction: prepareOnboard(data.inviter) });
			}
			await refresh();
		} finally {
			setOnboarding(false);
		}
	}, [gnosisAccount, refresh]);

	return {
		/** Display number for CoinBalanceHero (2-decimal). */
		talerBalance: Number(formatTaler(balanceRaw)),
		balanceRaw,
		onboarded,
		loading: loading || !ready,
		minting,
		onboarding,
		dailyMint,
		onboard,
		refresh,
		account: gnosisAccount,
	};
}
