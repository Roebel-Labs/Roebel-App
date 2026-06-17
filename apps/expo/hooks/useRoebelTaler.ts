import { useCallback, useEffect, useState } from "react";
import { sendTransaction } from "thirdweb";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import {
	isOnboarded,
	findInviter,
	getRoebelTalerBalance,
	getPersonalCrcBalance,
	formatTaler,
	prepareDailyMint,
	prepareOnboard,
	prepareSendRoebelTaler,
	prepareContributeToRoebelTaler,
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
	const [sending, setSending] = useState(false);

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

	/**
	 * Daily "Heute abholen": (1) claim accrued personal CRC (personalMint), then
	 * (2) deposit it as collateral to mint Röbel-Taler (groupMint). One tap → the
	 * citizen ends up with Röbel-Taler. Both txs are gasless on Gnosis.
	 */
	const dailyMint = useCallback(async () => {
		if (!gnosisAccount) throw new Error("Gnosis-Konto noch nicht bereit");
		setMinting(true);
		try {
			await sendTransaction({ account: gnosisAccount, transaction: prepareDailyMint() });
			const pcrc = await getPersonalCrcBalance(gnosisAccount.address).catch(() => 0n);
			if (pcrc > 0n) {
				await sendTransaction({
					account: gnosisAccount,
					transaction: prepareContributeToRoebelTaler(gnosisAccount.address, pcrc),
				});
			}
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
			// Already a Circles human? Nothing to do.
			if (await isOnboarded(gnosisAccount.address)) { await refresh(); return; }
			// Citizen-invites-citizen: find who invited us (trusted our address, e.g.
			// via Metri), then register directly — gasless, no backend operator.
			const inviter = await findInviter(gnosisAccount.address);
			if (!inviter) {
				throw new Error(
					"Du wurdest noch nicht eingeladen. Lass dich von einem Bürger einladen (z. B. in Metri deine Adresse einladen), dann hier erneut tippen.",
				);
			}
			await sendTransaction({ account: gnosisAccount, transaction: prepareOnboard(inviter) });
			await refresh();
		} finally {
			setOnboarding(false);
		}
	}, [gnosisAccount, refresh]);

	/** Send Röbel-Taler to another address (18-dec amount). Gasless. */
	const send = useCallback(async (to: string, amount: bigint) => {
		if (!gnosisAccount) throw new Error("Gnosis-Konto noch nicht bereit");
		setSending(true);
		try {
			await sendTransaction({
				account: gnosisAccount,
				transaction: prepareSendRoebelTaler(gnosisAccount.address, to, amount),
			});
			await refresh();
		} finally {
			setSending(false);
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
		sending,
		dailyMint,
		onboard,
		send,
		refresh,
		account: gnosisAccount,
	};
}
