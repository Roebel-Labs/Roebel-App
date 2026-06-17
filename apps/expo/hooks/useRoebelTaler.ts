import { useCallback, useEffect, useState } from "react";
import { sendTransaction } from "thirdweb";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import {
	isOnboarded,
	getRoebelTalerBalance,
	formatTaler,
	prepareDailyMint,
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

	return {
		/** Display number for CoinBalanceHero (2-decimal). */
		talerBalance: Number(formatTaler(balanceRaw)),
		balanceRaw,
		onboarded,
		loading: loading || !ready,
		minting,
		dailyMint,
		refresh,
		account: gnosisAccount,
	};
}
