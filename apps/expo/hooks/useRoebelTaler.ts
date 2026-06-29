import { useContext } from "react";
import { RoebelTalerContext } from "@/context/RoebelTalerProvider";

/**
 * Real on-chain Röbel Münzen (Circles on Gnosis), now backed by a single shared
 * RoebelTalerProvider so the balance + optimistic deltas + settlement queue are
 * consistent across every screen. Identical return shape to the old hook, plus
 * `enqueueSettlement`. User-facing term is always "Röbel Münzen".
 */
export function useRoebelTaler() {
	const ctx = useContext(RoebelTalerContext);
	if (!ctx) throw new Error("useRoebelTaler must be used within RoebelTalerProvider");
	return ctx;
}
