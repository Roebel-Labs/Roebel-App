// Thin thirdweb adapters over the deployed Deliberate contract (reads on gnosisRead,
// prepared writes for the gasless smart account). Method strings mirror IDeliberate.sol
// at the pinned commit 0392bd43 — keep them in sync with the deployment, not with upstream.
import { prepareContractCall, prepareEvent, readContract, parseEventLogs } from 'thirdweb';
import type { PreparedTransaction } from 'thirdweb';

import { deliberateContract, deliberateReadContract } from '../../constants/deliberate';
import {
	buildArgumentTree,
	derivePhase,
	type DebateArgumentNode,
	type DebatePhase,
} from './protocol';
import { bytes32ToDigest } from './content';

export interface DebateSummary {
	id: number;
	argumentsCount: number;
	participantsCount: number;
	totalVotes: number;
	feePercentage: number;
	identityRegistry: string;
	phase: DebatePhase;
	editingEndTime: number;
	ratingEndTime: number;
	lockingDuration: number;
	/** Whether the thesis was approved; null until the debate is finished. */
	approved: boolean | null;
}

const PHASE_FINISHED = 4;

export async function readDebate(id: number): Promise<DebateSummary | null> {
	const debateId = BigInt(id);
	const [debate, phases] = await Promise.all([
		readContract({
			contract: deliberateReadContract,
			method: 'function debates(uint256) view returns (uint32, uint16, uint32, uint8, address)',
			params: [debateId],
		}),
		readContract({
			contract: deliberateReadContract,
			method: 'function phases(uint256) view returns (uint8, uint48, uint48, uint48)',
			params: [debateId],
		}),
	]);
	const [totalVotes, argumentsCount, participantsCount, feePercentage, identityRegistry] = debate;
	const [currentPhase, editingEndTime, ratingEndTime, lockingDuration] = phases;
	if (Number(editingEndTime) === 0) return null;
	const finished = Number(currentPhase) === PHASE_FINISHED;
	const approved = finished
		? await readContract({
				contract: deliberateReadContract,
				method: 'function outcome(uint256) view returns (bool)',
				params: [debateId],
			})
		: null;
	return {
		id,
		argumentsCount: Number(argumentsCount),
		participantsCount: Number(participantsCount),
		totalVotes: Number(totalVotes),
		feePercentage: Number(feePercentage),
		identityRegistry,
		phase: derivePhase(Date.now() / 1000, Number(editingEndTime), Number(ratingEndTime), finished),
		editingEndTime: Number(editingEndTime),
		ratingEndTime: Number(ratingEndTime),
		lockingDuration: Number(lockingDuration),
		approved,
	};
}

export async function readDebateTree(
	id: number,
	argumentsCount: number,
	finished: boolean,
): Promise<DebateArgumentNode> {
	const debateId = BigInt(id);
	const args = await Promise.all(
		Array.from({ length: argumentsCount }, (_, argId) =>
			readContract({
				contract: deliberateReadContract,
				method:
					'function getArgument(uint256, uint16) view returns ((bytes32 contentURI, address creator, bool isSupporting, uint16 parentArgumentId, uint16 untalliedChilds, uint48 finalizationTime, uint32 pro, uint32 con, uint32 votes, uint32 subtreeVotes, int64 descendantsAggregate, int64 rating, int88 centeredApprovalSeconds, uint80 votesSeconds, uint48 lastAccrualTime, uint32 fees))',
				params: [debateId, argId],
			}).then((a) => ({
				id: argId,
				parentId: argId === 0 ? null : Number(a.parentArgumentId),
				creator: a.creator,
				isSupporting: argId === 0 ? null : a.isSupporting,
				contentDigest: bytes32ToDigest(a.contentURI),
				finalizationTime: Number(a.finalizationTime),
				pro: Number(a.pro),
				con: Number(a.con),
				votes: Number(a.votes),
				rating: finished ? Number(a.rating) : null,
			})),
		),
	);
	return buildArgumentTree(args);
}

export async function readMyDebateState(
	id: number,
	wallet: string,
): Promise<{ joined: boolean; tokens: number }> {
	const [role, tokens] = await readContract({
		contract: deliberateReadContract,
		method: 'function users(uint256, address) view returns (uint8, uint32, bool)',
		params: [BigInt(id), wallet],
	});
	return { joined: Number(role) === 1, tokens: Number(tokens) };
}

export async function readMyShares(
	id: number,
	argumentId: number,
	wallet: string,
): Promise<{ pro: number; con: number }> {
	const shares = await readContract({
		contract: deliberateReadContract,
		method: 'function getUserShares(uint256, uint16, address) view returns ((uint32 pro, uint32 con))',
		params: [BigInt(id), argumentId, wallet],
	});
	return { pro: Number(shares.pro), con: Number(shares.con) };
}

export async function quoteStake(
	id: number,
	argumentId: number,
	isPro: boolean,
	amount: number,
): Promise<{ fee: number; sharesOut: number }> {
	const q = await readContract({
		contract: deliberateReadContract,
		method:
			'function quoteStake(uint256, uint16, bool, uint32) view returns ((bool isPro, uint32 voteTokensStaked, uint32 fee, uint32 sharesOut))',
		params: [BigInt(id), argumentId, isPro, amount],
	});
	return { fee: Number(q.fee), sharesOut: Number(q.sharesOut) };
}

export async function readDebatesCount(): Promise<number> {
	const count = await readContract({
		contract: deliberateReadContract,
		method: 'function debatesCount() view returns (uint256)',
		params: [],
	});
	return Number(count);
}

export function prepareJoin(id: number): PreparedTransaction {
	return prepareContractCall({
		contract: deliberateContract,
		method: 'function join(uint256)',
		params: [BigInt(id)],
	});
}

export function prepareAddArgument(
	id: number,
	parentArgumentId: number,
	contentURI: `0x${string}`,
	isSupporting: boolean,
	initialApproval: number,
	deposit: number,
): PreparedTransaction {
	return prepareContractCall({
		contract: deliberateContract,
		method: 'function addArgument(uint256, uint16, bytes32, bool, uint8, uint32) returns (uint16)',
		params: [BigInt(id), parentArgumentId, contentURI, isSupporting, initialApproval, deposit],
	});
}

export function prepareStake(
	id: number,
	argumentId: number,
	isPro: boolean,
	amount: number,
): PreparedTransaction {
	return prepareContractCall({
		contract: deliberateContract,
		method: isPro
			? 'function stakePro(uint256, uint16, uint32)'
			: 'function stakeCon(uint256, uint16, uint32)',
		params: [BigInt(id), argumentId, amount],
	});
}

export function prepareTally(id: number): PreparedTransaction {
	return prepareContractCall({
		contract: deliberateContract,
		method: 'function tallyTree(uint256)',
		params: [BigInt(id)],
	});
}

export function prepareCreateDebate(
	contentURI: `0x${string}`,
	lockingDuration: number,
	editingDuration: number,
	ratingDuration: number,
	feePercentage: number,
	identityRegistry: string,
): PreparedTransaction {
	// Bounties stay off in the Röbel deployment (spec §6: legal review first).
	return prepareContractCall({
		contract: deliberateContract,
		method:
			'function createDebate(bytes32, uint48, uint48, uint48, uint8, address, address, uint256) returns (uint256)',
		params: [
			contentURI,
			BigInt(lockingDuration),
			BigInt(editingDuration),
			BigInt(ratingDuration),
			feePercentage,
			identityRegistry,
			'0x0000000000000000000000000000000000000000',
			0n,
		],
	});
}

const debateCreatedEvent = prepareEvent({
	signature:
		'event DebateCreated(uint256 indexed debateId, address indexed creator, bytes32 contentURI, uint48 lockingDuration, uint48 editingEndTime, uint48 ratingEndTime, uint8 feePercentage, address identityRegistry)',
});

export function extractDebateIdFromReceipt(receipt: { logs: unknown }): number | null {
	try {
		const events = parseEventLogs({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			logs: (receipt as any).logs,
			events: [debateCreatedEvent],
		});
		const first = events[0] as { args?: { debateId?: bigint } } | undefined;
		return first?.args?.debateId != null ? Number(first.args.debateId) : null;
	} catch {
		return null;
	}
}
