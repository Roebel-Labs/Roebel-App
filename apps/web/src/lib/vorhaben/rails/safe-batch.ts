import { encodeFunctionData, getAddress, parseAbi } from "viem";
import { EURE } from "../constants";
import { toAtto } from "../money";

const erc20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

export function buildEureTransfers(lines: { recipient_wallet: string | null; amount: string; asset: string }[]) {
  return lines.map((l) => {
    if (l.asset !== "EURe") throw new Error(`safe_eure line with asset ${l.asset}`);
    if (!l.recipient_wallet) throw new Error("safe_eure line without recipient wallet");
    return {
      to: EURE as string,
      value: "0" as const,
      data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [getAddress(l.recipient_wallet), toAtto(l.amount)] }),
    };
  });
}
