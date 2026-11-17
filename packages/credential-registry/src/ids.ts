import { encodeAbiParameters, keccak256, toBytes, type Hex } from "viem";

export const CREDENTIAL_TYPE_PREFIX = "netizen:credential-type:v1:";

/** Community namespace: bytes32(0). */
export const COMMUNITY_ORG_ID: Hex = `0x${"00".repeat(32)}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** keccak256(utf8("netizen:credential-type:v1:" + lowercase uuid)). */
export function localIdFromUuid(uuid: string): Hex {
  const u = uuid.trim().toLowerCase();
  if (!UUID.test(u)) throw new Error(`not a uuid: ${uuid}`);
  return keccak256(toBytes(CREDENTIAL_TYPE_PREFIX + u));
}

/** Local id of one of the three reserved community types. */
export function localIdFromName(name: "citizen" | "attester" | "guest"): Hex {
  return keccak256(toBytes(CREDENTIAL_TYPE_PREFIX + name));
}

/** keccak256(abi.encode(bytes32 orgId, bytes32 localId)). */
export function credentialTypeId(orgId: Hex, localId: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [orgId, localId]),
  );
}

export const RESERVED_TYPE_IDS: { citizen: Hex; attester: Hex; guest: Hex } = {
  citizen: credentialTypeId(COMMUNITY_ORG_ID, localIdFromName("citizen")),
  attester: credentialTypeId(COMMUNITY_ORG_ID, localIdFromName("attester")),
  guest: credentialTypeId(COMMUNITY_ORG_ID, localIdFromName("guest")),
};

