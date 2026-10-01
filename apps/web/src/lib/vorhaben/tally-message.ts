import { encodeAbiParameters, keccak256 } from "viem";

export interface TallyFacts {
  proposalId: bigint;
  proposalNumber: number;
  title: string;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  tallyAddress: `0x${string}`;
}

export function tallyResultHash(f: TallyFacts): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
    [f.proposalId, f.forVotes, f.againstVotes, f.abstainVotes, f.tallyAddress],
  ));
}

/** The exact text an Attester signs. Rebuilt server-side from chain data on submit. */
export function buildTallyConfirmMessage(f: TallyFacts): string {
  return (
    `Ich bestätige das Auszählungsergebnis von Vorschlag #${f.proposalNumber} „${f.title}": ` +
    `Ja ${f.forVotes}, Nein ${f.againstVotes}, Enthaltung ${f.abstainVotes}. ` +
    `Auszählungsvertrag ${f.tallyAddress.toLowerCase()} auf Gnosis. ` +
    `Ergebnis-Hash ${tallyResultHash(f)}.`
  );
}
