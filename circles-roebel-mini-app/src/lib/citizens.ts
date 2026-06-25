// The migration-minted Röbel citizens on Gnosis (5 are Attesters). These are the
// on-chain CitizenNFTv2 holders (their thirdweb smart-account addresses) — the wallets
// we invite into Circles.
//
// IMPORTANT: this is only a STATIC FALLBACK for first render / offline / RPC failure.
// The live source of truth is the on-chain CitizenNFTv2 contract — see
// `fetchRoebelCitizens()` in ./citizens-onchain. Every newly-verified citizen appears
// automatically there with no code edit. Source of the fallback snapshot:
// contracts/governor-contract/deployments/gnosis-v2.json (holders.citizens / .attesters).
export interface Citizen {
  address: `0x${string}`;
  attester: boolean;
}

export const ROEBEL_CITIZENS: Citizen[] = [
  { address: "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28", attester: true },
  { address: "0x90F677dC480e76a127Ec1dCE42263a370e396313", attester: true },
  { address: "0xf468d87FCa0E15bC2c383eF482D38b9b77812b29", attester: true },
  { address: "0xD7cA07c0F152fC27F0E48d5326e07026e4fDD4bA", attester: true },
  { address: "0x3B49287F15F5605036d135A296C2bAC2aFbFA24c", attester: true },
  { address: "0xCa598EcD6541177897c7a30cE378e53F5557e951", attester: false },
  { address: "0xEbf3C1694FBD80b1a7ab8F82e19A1291Cd795227", attester: false },
  { address: "0x466587C1102a99726b2751712c69338cf0401f43", attester: false },
  { address: "0x5Ddf5ee5ac3b5DeB9eae2920E71997e2a07A406B", attester: false },
  { address: "0xa6B3defbBe135f3fcE045e59b3e984c23d43E5a8", attester: false },
  { address: "0x1a3cD237400b032DCfB3d45Ef694674f2dEcdee0", attester: false },
  { address: "0x2645530306321e4758FF93559A4F44a826C6EfA6", attester: false },
  { address: "0x1916bAC01118EE53A7F7eca0F312431b68011Ce4", attester: false },
  { address: "0xd1A7d945fCCa08f67E30E526E34cf4Aaa2725D03", attester: false },
  { address: "0x0e9C37cfc94E1BAFCd53450998Cc26d10A6b5D20", attester: false },
  { address: "0x0C8963DDceC03DaDA390F097Ac1E4362e81B59c2", attester: false },
  { address: "0x2e7aB171128EF2dE883043E0b06A6f275cD03914", attester: false },
  { address: "0xdeF673b34D47e135968E875F13f5382055e216B1", attester: false },
  { address: "0x4Aa85FD1d27e2efDF563Fb9831d00176b9E41131", attester: false },
  { address: "0xce269787bf696D93f23cf5863ca63EaD942825D2", attester: false },
];

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// On-chain proof links (Circles Explorer).
export const explorerAvatar = (a: string) => `https://explorer.aboutcircles.com/avatar/${a}`;
export const explorerTx = (h: string) => `https://explorer.aboutcircles.com/tx/${h}`;
