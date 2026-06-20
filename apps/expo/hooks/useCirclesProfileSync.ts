// Publishes a citizen's Röbel name + photo to their Circles avatar profile (Gnosis),
// so they appear as a person — not a 0x address — in Metri / the Explorer / every
// Circles app. Opt-in: nothing is published until the citizen explicitly enables it.
//
// Flow: resize the avatar → pin {name, previewImageUrl} to the Circles profile service
// → convert the returned CID to a bytes32 digest → write it to the NameRegistry as the
// smart account (gasless). Removing = writing the zero digest.
import { useCallback, useEffect, useState } from "react";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { client } from "@/constants/thirdweb";
import { gnosis, nameRegistryAddress } from "@/constants/gnosis";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import {
	pinCirclesProfile,
	cidV0ToDigest,
	getPublishedDigest,
	type CirclesProfileInput,
} from "@/lib/circles-profile";

const ZERO_DIGEST = ("0x" + "0".repeat(64)) as `0x${string}`;

export interface ProfileSource {
	name: string;
	description?: string;
	imageUrl?: string;
}

/** Download a remote avatar and shrink it to a small base64 thumbnail for the profile. */
async function buildPreviewDataUrl(imageUrl?: string): Promise<string | undefined> {
	if (!imageUrl) return undefined;
	try {
		const local = (FileSystem.cacheDirectory ?? "") + `circles-avatar-${Date.now()}.img`;
		const dl = await FileSystem.downloadAsync(imageUrl, local);
		const out = await ImageManipulator.manipulateAsync(
			dl.uri,
			[{ resize: { width: 256, height: 256 } }],
			{ compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
		);
		return out.base64 ? `data:image/jpeg;base64,${out.base64}` : undefined;
	} catch {
		return undefined; // a missing photo shouldn't block publishing the name
	}
}

export function useCirclesProfileSync() {
	const { gnosisAccount } = useGnosisWallet();
	const address = gnosisAccount?.address;
	const [published, setPublished] = useState<boolean | null>(null); // null = still loading
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		if (!address) {
			setPublished(null);
			return;
		}
		const digest = await getPublishedDigest(address);
		setPublished(!!digest);
	}, [address]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const nameRegistry = useCallback(
		() => getContract({ client, chain: gnosis, address: nameRegistryAddress }),
		[],
	);

	/** Pin the profile and write its digest on-chain (gasless). */
	const publish = useCallback(
		async (src: ProfileSource) => {
			if (!gnosisAccount) throw new Error("Wallet ist noch nicht bereit.");
			setBusy(true);
			try {
				const previewImageUrl = await buildPreviewDataUrl(src.imageUrl);
				const profile: CirclesProfileInput = {
					name: (src.name || "").trim().slice(0, 36) || "Röbel-Bürger:in",
					description: src.description ? src.description.slice(0, 500) : undefined,
					previewImageUrl,
					imageUrl: src.imageUrl,
				};
				const cid = await pinCirclesProfile(profile);
				const digest = cidV0ToDigest(cid) as `0x${string}`;
				await sendTransaction({
					account: gnosisAccount,
					transaction: prepareContractCall({
						contract: nameRegistry(),
						method: "function updateMetadataDigest(bytes32 _metadataDigest)",
						params: [digest],
					}),
				});
				setPublished(true);
			} finally {
				setBusy(false);
			}
		},
		[gnosisAccount, nameRegistry],
	);

	/** Remove the public profile by writing the zero digest. */
	const unpublish = useCallback(async () => {
		if (!gnosisAccount) throw new Error("Wallet ist noch nicht bereit.");
		setBusy(true);
		try {
			await sendTransaction({
				account: gnosisAccount,
				transaction: prepareContractCall({
					contract: nameRegistry(),
					method: "function updateMetadataDigest(bytes32 _metadataDigest)",
					params: [ZERO_DIGEST],
				}),
			});
			setPublished(false);
		} finally {
			setBusy(false);
		}
	}, [gnosisAccount, nameRegistry]);

	return { published, busy, publish, unpublish, refresh, address };
}
