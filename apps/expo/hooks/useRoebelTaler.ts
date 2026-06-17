import { useCallback, useEffect, useState } from "react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import {
	isOnboarded,
	getRoebelTalerBalance,
	formatTaler,
	prepareDailyMint,
} from "@/lib/roebel-taler";

/**
 * Isolated hook for the real on-chain Röbel-Taler (Gnosis, via thirdweb). Keeps the
 * currency logic out of RewardsContext (which stays the off-chain gamification points).
 * The user-facing currency is always "Röbel-Taler" — never surface CRC/Circles.
 */
export function useRoebelTaler() {
	const account = useActiveAccount();
	const address = account?.address;
	const { mutateAsync: send, isPending: minting } = useSendTransaction();

	const [balanceRaw, setBalanceRaw] = useState<bigint>(0n);
	const [onboarded, setOnboarded] = useState(false);
	const [loading, setLoading] = useState(true);

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
		await send(prepareDailyMint());
		await refresh();
	}, [send, refresh]);

	return {
		/** Display number for CoinBalanceHero (2-decimal). */
		talerBalance: Number(formatTaler(balanceRaw)),
		balanceRaw,
		onboarded,
		loading,
		minting,
		dailyMint,
		refresh,
	};
}
