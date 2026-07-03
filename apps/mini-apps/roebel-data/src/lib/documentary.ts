// Static, baked-in catalogue of the "Build in Public" video documentary — a series
// of short films minted as Zora "content coins" on Base by @maxbrych. Captured
// 2026-06-28 from the Zora public API (https://api-sdk.zora.engineering/coin).
//
// Playback streams the ORIGINAL mp4 from IPFS via a public gateway: Zora's own
// Cloudflare Stream URLs (videoHlsUrl / videoPreviewUrl) are unreliable and 404.
// The IPFS source serves `video/mp4` with HTTP range (seek) and open CORS, so it
// drops straight into a native <video> element. Stats (holders) are a snapshot;
// this screen is a viewer — "View on Zora" links out for live market data.

/** The creator of every episode (Zora handle @maxbrych). */
export const CREATOR_ADDRESS = "0x5ba904420d058ef93b8fec0e6efb5c69af46db65";

export type DocVideo = {
  /** 1-based position in the series (matches the "#N" in most titles). */
  episode: number;
  /** Zora coin contract address on Base. */
  address: string;
  title: string;
  /** May be empty — render falls back to creator + date. */
  description: string;
  /** IPFS CID of the source mp4 (pass to videoUrl()). */
  videoCid: string;
  /** Preview image (~600px) for list thumbnails. */
  thumb: string;
  /** Larger preview image (~1200px) used as the player poster. */
  poster: string;
  creatorHandle: string | null;
  creatorAvatar: string | null;
  /** ISO 8601 mint timestamp. */
  createdAt: string;
  /** Unique holders at capture time (snapshot). */
  holders: number;
  /** Canonical Zora coin page (carries the referrer). */
  zoraUrl: string;
};

const IPFS_GATEWAY = "https://magic.decentralized-content.com/ipfs/";

/** Build a playable mp4 URL from an IPFS CID. */
export function videoUrl(cid: string): string {
  return `${IPFS_GATEWAY}${cid}`;
}

export const DOCUMENTARY_VIDEOS: DocVideo[] = [
  {
    episode: 1,
    address: "0x1766dca9b82f55904dcc3f837156457eedf5cd45",
    title: "Setting up DAO Governance for my home town - Build in Public #1",
    description: "In this video I describe how I plan to move my home town onchain by introducing DAO-like governance structure. I also show a Demo.",
    videoCid: "bafybeicnhtwj6rlaqu3lpc7backnpy76swl4ib6aogmi26af6ia5qq4pla",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhmM3BjYm96NHpka2hwcTMyZmJ2c3RxaHM3YXVzczRmdm90Z3d6ZG5rbDRvd3pnYWVjc2U=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhmM3BjYm96NHpka2hwcTMyZmJ2c3RxaHM3YXVzczRmdm90Z3d6ZG5rbDRvd3pnYWVjc2U=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-19T21:17:15+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x1766dca9b82f55904dcc3f837156457eedf5cd45?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 2,
    address: "0x7548ad806655a4e78ba5081fb928a4e928cc1217",
    title: "Building a events app as a gateway to Ethereum - Build in Public",
    description: "",
    videoCid: "bafybeieqoxnoii4zfhxfrcokajufbnxuxs5xtrg5rxpsqexasnuftsl6oa",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZtb3ZodGNqN2NiM3phZmZsaHh6bzRwYTJ5enB1ZXp3ZXN0emNrYWhvbWh6eXdqcXQydnE=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZtb3ZodGNqN2NiM3phZmZsaHh6bzRwYTJ5enB1ZXp3ZXN0emNrYWhvbWh6eXdqcXQydnE=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-19T21:17:55+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x7548ad806655a4e78ba5081fb928a4e928cc1217?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 3,
    address: "0x0384cba202b90f8b2ccdde235e03924bbe57b6d3",
    title: "Update on the app and design - Build in Public #3",
    description: "",
    videoCid: "bafybeibfm3ebpebjbew5jnicikmepzm5px55tzwib4x4xd4wzdc6u6lr4i",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWFxcGVjbmZ4YXdsMnl2NGw1emQyam1ndDZkYXVna2tyamxoc2JzZHdtemFsY29qcWhmM3E=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWFxcGVjbmZ4YXdsMnl2NGw1emQyam1ndDZkYXVna2tyamxoc2JzZHdtemFsY29qcWhmM3E=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-19T21:21:13+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x0384cba202b90f8b2ccdde235e03924bbe57b6d3?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 4,
    address: "0x9a618704affa229a03331cde6eaff7e7d506e1d0",
    title: "Landing page and dashboard - Build in Public #4",
    description: "In this video I share the v1 of the landing page and dashboard my hometown will get. I also share errors I'm currently getting into and plans for the future.",
    videoCid: "bafybeia6rmt6drr6y3occxg6ztp64ekhpoa7yhom7lbv6swqg5gfv3f3mq",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJ0MnoyeG82N3NuenFqc3Aydm96eDJmem1ib2w0bHM3NTZuaHZoNGRnNGVhem5lejcyZjQ=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJ0MnoyeG82N3NuenFqc3Aydm96eDJmem1ib2w0bHM3NTZuaHZoNGRnNGVhem5lejcyZjQ=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-21T20:32:45+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0x9a618704affa229a03331cde6eaff7e7d506e1d0?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 5,
    address: "0x53f70509e9c5cc186d6dc36b643cc54ca8fbaed4",
    title: "App APK with wallet and project timeline - Build in Public #5",
    description: "Finally I got the APK with the wallet integration working. Now the next steps will be to fix bugs, focus on great design and get the APK into the App Stores.",
    videoCid: "bafybeielr4lp6d5velvmzgy2gfihzfil7fw4i3bvgecbrzji2hoipr2a34",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJ5cGY0cjZmdnF0emd3emJvNDU2a3phZmhmZDVzZ3BtYzVtN3R5emU3cnFubDVmcTUyc3k=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJ5cGY0cjZmdnF0emd3emJvNDU2a3phZmhmZDVzZ3BtYzVtN3R5emU3cnFubDVmcTUyc3k=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-22T20:48:47+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x53f70509e9c5cc186d6dc36b643cc54ca8fbaed4?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 6,
    address: "0xb71d0a6868fb7abfd9a904266d7bebd4aa062978",
    title: "Governor Proposals in the App - Build in Public #6",
    description: "All the technical groundwork is done now. Proposals from my Governor Smart Contract are in the App now and voting works nearly instant.",
    videoCid: "bafybeidisrcdlh3dhlv3ljqwe3wwpx3t772kkodg2yzdvdpetiaambz4ia",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhqY2YzZXViYmN5NWJ0NGlwYXhleWhtbXh6NDI3Nzd2cXhkZ2hqNTY1aHlmcHl3djRodXE=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhqY2YzZXViYmN5NWJ0NGlwYXhleWhtbXh6NDI3Nzd2cXhkZ2hqNTY1aHlmcHl3djRodXE=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-23T19:56:09+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0xb71d0a6868fb7abfd9a904266d7bebd4aa062978?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 7,
    address: "0xe8f173c177f07840a9aa3277c8cf7887d2b8d560",
    title: "Brand and Design vision - Build in Public #7",
    description: "In this video I share how I came up the the brand and design vision of my home town app.",
    videoCid: "bafybeihk7f27uzkbn7gq6nhvciirxpthxzn7jijvzqanjcshc4yxl3umky",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhoNXhlcHUyenRuYWhwbTZxd3luNHJqNmd1a2FzdGV0dW00Znczazd3M3oydWFub3liamU=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhoNXhlcHUyenRuYWhwbTZxd3luNHJqNmd1a2FzdGV0dW00Znczazd3M3oydWFub3liamU=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-26T21:40:27+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0xe8f173c177f07840a9aa3277c8cf7887d2b8d560?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 8,
    address: "0xf9729017625a7b8db4ffeac178127cb3574eb57f",
    title: "Testing out Semaphore Protocol - Build in Public #8",
    description: "Today, I'm testing out the Semaphore Protocol to register new Citizens.",
    videoCid: "bafybeih37jae44txbdww32p45ew2yjjbgsjb2lwcio57msxo7xmvabqdw4",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWdpam9oamFiZ2lyNHVndHZtbHd1Mm42bmthcWwzeHRvMmFtM2xkNXJsazU3dnZiYzZkc3E=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWdpam9oamFiZ2lyNHVndHZtbHd1Mm42bmthcWwzeHRvMmFtM2xkNXJsazU3dnZiYzZkc3E=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-27T22:50:17+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0xf9729017625a7b8db4ffeac178127cb3574eb57f?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 9,
    address: "0xd47b6a03ae62f66a98b93609c4e8f63fcaa84e00",
    title: "Design update - Build in Public #9",
    description: "Today I designed the Screens in Figma and the Front-end in the App",
    videoCid: "bafybeica3etqgp3m5ztk5xlwty7tp6ndcz4xbg5jin5lygdfda7dca2nui",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWdvZnRjaGVldTZiN3g3a3VmanUydXUybmpic2hjdTM2dGNlaWVlbTJxaGVsZDNkZXZmczQ=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWdvZnRjaGVldTZiN3g3a3VmanUydXUybmpic2hjdTM2dGNlaWVlbTJxaGVsZDNkZXZmczQ=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-28T23:08:27+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0xd47b6a03ae62f66a98b93609c4e8f63fcaa84e00?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 10,
    address: "0x401b5db33a876a64851a99c19e3a2d1581ecef58",
    title: "Google Play Store Listing - Build in Public #10",
    description: "I finally have a internal testing in the Google Play Store for my Hometown App.",
    videoCid: "bafybeieaic3pblp7f76ista6ryge4hjz6ekcslirbheiyeebyqf3wyv3f4",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWNrdDNuZGtuN3ZhZnM0dnB0Zmd2NWoybHhscWJ3YWZqcmZ2a2sydjc2dzNhcXhhYXVmank=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWNrdDNuZGtuN3ZhZnM0dnB0Zmd2NWoybHhscWJ3YWZqcmZ2a2sydjc2dzNhcXhhYXVmank=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-10-31T22:33:21+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x401b5db33a876a64851a99c19e3a2d1581ecef58?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 11,
    address: "0x175d63d2e4f06f484d6dc8f90727b0db106bc20f",
    title: "Trojan Horse Part 1 - Build in Public #11",
    description: "This is how I verify Citizens of my home town onchain in a peer-to-peer in-human way and privacy preserving",
    videoCid: "bafybeifewwzf32kqdw4stu3sxdc7h7bwwarwadfg3exqc3tispc72mtbom",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWV1Y2l3enpwamhtc3V2aWtuNjU2dXdkMnV1YzNnbHZmeXU3ZDdseDZxaGhwaXlkaXBsYWk=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWV1Y2l3enpwamhtc3V2aWtuNjU2dXdkMnV1YzNnbHZmeXU3ZDdseDZxaGhwaXlkaXBsYWk=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-11-11T21:39:49+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x175d63d2e4f06f484d6dc8f90727b0db106bc20f?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 12,
    address: "0x108b89487e03106b54a475e5a9845427f5deae92",
    title: "Trojan Horse Part 2 - Build in Public #12",
    description: "This is the trojan horse app with p2p citizen verification",
    videoCid: "bafybeifzjudpknuzvvqrfu4kp3gsdxzfi7sff3sbdifet7n6txx7djixnm",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWRqbjI2b2xqbW95dDI2N25nbGt4Yng2ZHhwZnEyeWkzdHJweGlycGQ3b3Y2bmtmczI3emE=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWRqbjI2b2xqbW95dDI2N25nbGt4Yng2ZHhwZnEyeWkzdHJweGlycGQ3b3Y2bmtmczI3emE=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-11-11T21:40:23+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x108b89487e03106b54a475e5a9845427f5deae92?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 13,
    address: "0x99b3f7e7773d2065b04427d4c620b94bb99c483f",
    title: "Town Citizen Social Graph visualization - Build in Public #13",
    description: "A data visualization of all verified citizens in our home town to the town app website.",
    videoCid: "bafybeicooyuxd44mrsne3ey4sqd7m5rbzlclzxzrmrhuhp2gxfxbc6ev5i",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWYyZDJ2MzN3bDRxeDM0bGVxamF6dGFpbmdtZGVxaGtqNGZxMnN1Zmt6bnB6aTNjbGp4ZmE=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWYyZDJ2MzN3bDRxeDM0bGVxamF6dGFpbmdtZGVxaGtqNGZxMnN1Zmt6bnB6aTNjbGp4ZmE=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-11-23T19:40:43+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x99b3f7e7773d2065b04427d4c620b94bb99c483f?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 14,
    address: "0xd14a8ac9d89208e29212de0a493eadac72432ddb",
    title: "Launch and some ideas - Build in Public #14",
    description: "",
    videoCid: "bafybeih2yjlzsytkjgxgvdfqq27wiurtsjkukrfflfr3jl55leiamsgosi",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhyYXo1dDZxN2NuZ2x3eDJhc3lmc3dsb3BoY2c2dXgycm5oa3ppN29kYWtub2JlNTJxNnk=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhyYXo1dDZxN2NuZ2x3eDJhc3lmc3dsb3BoY2c2dXgycm5oa3ppN29kYWtub2JlNTJxNnk=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2025-11-27T21:02:47+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0xd14a8ac9d89208e29212de0a493eadac72432ddb?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 15,
    address: "0x2dba8ac1831358da75a38464f8bfe533c83e322c",
    title: "Introducing Netizen Labs",
    description: "",
    videoCid: "bafybeibvfyuwyuncj3uopqhmxpegehfjs4vvd2slnh7rfsqab3gp5o7xoq",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhxd213cHZhMmxjaHl0M3hwaDM1eHozZ3F4NzJsdXdrdWp1dzN1b2ZrM2Q0dnNiZnR4bjQ=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWhxd213cHZhMmxjaHl0M3hwaDM1eHozZ3F4NzJsdXdrdWp1dzN1b2ZrM2Q0dnNiZnR4bjQ=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2026-06-12T21:40:31+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0x2dba8ac1831358da75a38464f8bfe533c83e322c?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 16,
    address: "0x7ef48f5ee0a61c6b146cd15b7de7e94461dfea52",
    title: "App Update May 2026",
    description: "",
    videoCid: "bafybeif6au27cc5feticnt2i3d7wimvrygljgkscugscmkbmicoxm5yzgq",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJybTZsZnl1dG1yZHV2aW1ubm1hcmN3Y3V0eXhvNHRuN3prcDR1dGFzcmw3M2ZlbWlxcW0=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWJybTZsZnl1dG1yZHV2aW1ubm1hcmN3Y3V0eXhvNHRuN3prcDR1dGFzcmw3M2ZlbWlxcW0=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2026-06-29T00:12:19+00:00",
    holders: 2,
    zoraUrl: "https://zora.co/coin/base:0x7ef48f5ee0a61c6b146cd15b7de7e94461dfea52?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 17,
    address: "0xd4bad68f9b9feeabce1ba0df19e809a242d0b54d",
    title: "Circles in a town #1",
    description: "",
    videoCid: "bafybeifdi3zxa5yd56m3hkralt2ce5dis2pqet3hpftitratclvivw62b4",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWNtb3p3aHdhdWV1c3FzYm5idWp1bDQ1ZW9iaHFtZWFnd2F6Mm9wYzJ2NjdsZDJzNXV2Mmk=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWNtb3p3aHdhdWV1c3FzYm5idWp1bDQ1ZW9iaHFtZWFnd2F6Mm9wYzJ2NjdsZDJzNXV2Mmk=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2026-06-29T00:16:29+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0xd4bad68f9b9feeabce1ba0df19e809a242d0b54d?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
  {
    episode: 18,
    address: "0xdbefa786906d9f92773c5dc2517cc50212211220",
    title: "Circles in a town - first ever onchain proposal #2",
    description: "",
    videoCid: "bafybeig7zebvqmglutkqng6ytc7pf4wn3d2vth2ln447wipwjfpmt3tm4y",
    thumb: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWRqN3gzNXlva3BneGJiMjJuandmamM0Ym4yZHFrc2E1bWhxZnZnY2F6aWdzcWVrdmV6Z2U=",
    poster: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:1200:1200/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWRqN3gzNXlva3BneGJiMjJuandmamM0Ym4yZHFrc2E1bWhxZnZnY2F6aWdzcWVrdmV6Z2U=",
    creatorHandle: "maxbrych",
    creatorAvatar: "https://scontent-iad4-1.choicecdn.com/-/rs:fit:600:600/f:best/aHR0cHM6Ly9tYWdpYy5kZWNlbnRyYWxpemVkLWNvbnRlbnQuY29tL2lwZnMvYmFmeWJlaWZveTdwY3BrcHl1aG8ya3kzNXI3c2prb2RseHY2cTc3Znh1cTVnZXU1Nnh4anRrMzJhZGU=",
    createdAt: "2026-06-29T00:23:49+00:00",
    holders: 0,
    zoraUrl: "https://zora.co/coin/base:0xdbefa786906d9f92773c5dc2517cc50212211220?referrer=0x5ba904420d058ef93b8fec0e6efb5c69af46db65",
  },
];
