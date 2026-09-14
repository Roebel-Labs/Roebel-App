# Logos Technology Stack — integration assessment for Röbel / Netizen

**2026-09-14.** Deep research into https://logos.co/technology-stack (Messaging ex-Waku,
Storage ex-Codex, Blockchain ex-Nomos, Networking, Runtime/Basecamp) mapped against the
stack that is live today: XMTP dual-rail DMs, Supabase Storage + Cloudflare Stream, the
Nostr public record with the `/media/<sha256>` mirror, MACI on Gnosis, the `netizen`
node manifest. Method: four parallel web-research passes (~450 fetches across
logos.co, docs.logos.co, lip.logos.co, blog.logos.co, forum.research.logos.co, the
`logos-messaging` / `logos-storage` / `logos-blockchain` / `vacp2p` GitHub orgs, npm and
GitHub release APIs), cross-read against the repo docs listed in §8. Claims carry a
source; anything marked *(inference)* is our reading, not a Logos statement.

Companions: [Chat protocol decision](2026-07-26_CHAT_PROTOCOL_DECISION.md),
[Supabase exit](2026-07-27_DATA_SOVEREIGNTY_SUPABASE_EXIT.md),
[Data placement and CRUD](../DATA_PLACEMENT_AND_CRUD.md),
[Public data on Nostr](../PUBLIC_DATA_ON_NOSTR.md),
[XMTP integration state](../XMTP_INTEGRATION_STATE.md),
[Roadmap §12 (Blossom media)](../ROADMAP_AND_DEFERRED.md).

---

## 0. Decision summary (BLUF)

Logos in September 2026 is a **desktop-native, C++/Qt module platform on a public testnet**
(Testnet v0.2, 2026-06-30; Basecamp 0.2.3 for macOS/Linux; mainnet targeted "early 2027").
None of its three protocol layers ships a React Native or a browser-grade product SDK, and
its identity model is deliberately not Ethereum-shaped. The two ideas that prompted this
research do not survive contact with the 2026 state of the stack, but both point at real
gaps that can be closed now with what we already run.

| Idea | Verdict | What to do instead / trigger to revisit |
|---|---|---|
| **Waku replaces XMTP for DMs + notifications** | **No, not in 2026.** No maintained RN SDK (`@waku/react-native` archived 2023-11-21); Logos Chat is a desktop-only *Preview* without receipts, reactions, attachments, persistence or offline; Store is best-effort (≥12 h on the public network); OS push still needs APNs/FCM plus our own server. The messaging roadmap lists **"Support Mobile Platforms" under "Required for Mainnet"**, i.e. after Testnet v0.3. Most "XMTP bugs" we hit are ours (push tokens, activation flow) or are shared by every MLS system (new device cannot read old history). | Fix the XMTP backlog **or**, if sovereignty is the driver, take the already-assessed **Nostr NIP-17 → Marmot** path on the live relay (JS-only, no native module). Revisit Waku when **(a)** Status finishes its mobile cutover to Logos Delivery, **(b)** a Chat SDK reaches Beta with mobile bindings or a JS package on npm, **(c)** RLN memberships can live on a chain we use. Earliest sensible re-check: **Q2 2027**. |
| **Logos Storage CID for every file** | **No as a store; the goal is right.** Codex's durability engine (erasure coding, storage proofs, marketplace, token) was paused Aug 2025 and removed Jan 2026. What ships is BitTorrent-style file sharing with organic replication: no durability, no payments, no encryption at rest, no gateway or light client, CIDs use private multicodecs (0xCD01–03) that IPFS cannot resolve, pre-alpha, testnet. | **Blossom server on the node** (sha256-addressed, Nostr-signed uploads, peer mirroring) + the sha256 already carried in every signed event, plus a derived IPFS CIDv1 for portability. This is Roadmap §12 and the real "CID for every file". Optional ≤2-day sidecar that also pins public blobs to a Logos Storage node, labelled experimental. Revisit as a durable tier when Logos ships **incentivised persistence** (post-mainnet, 2027+). |
| **Logos Blockchain (LEZ / Bedrock)** | **No.** RISC Zero zkVM with Rust programs, no EVM, no bridge to any production chain, testnet resets, no token disclosed, validator keys are Ed25519 + hash-based ZK keys ("Bitcoin/Ethereum compatibility impossible"). Nothing on Gnosis (4337 accounts, CitizenNFTv2, MACI, Circles) can move or bridge. | Watch only: RLN-on-LEE milestone, mainnet 2027, the Zone model as a reference design. |
| **Networking / mixnet (LIP-99 nim-libp2p-mix)** | **No.** Research-stage; used today only for Storage DHT lookups and a 5-node chat demo; no mobile. | Watch for node↔node federation privacy once a second independent node exists. |
| **Runtime / Basecamp / user modules** | **No.** C++17/Qt6 `.lgx` modules, macOS/Linux desktop; JS SDK is an unpublished Node-only FFI shim. Irrelevant to RN + Next.js. | Conceptual cousin of Roadmap §19 "Netizen OS". Positioning idea only. |
| **zerokit RLN (Vac), standalone** | **Not now.** Rust/WASM library, usable without Waku; RLN-API scopes memberships by CAIP-10 id, so a membership registry on Gnosis (`eip155:100`) is spec-compatible *(inference)*. But Hermes has no WASM, so in the Expo app this is a native module over the `go-zerokit-rln-apple`/`-arm` bindings, and **the Expo app is the only surface citizens use** (the Next.js app has no citizen users as of 2026-09-14). A web-only post box reaches nobody. | Keep in the ZK/sybil track; revisit only with an Expo-native proving path. |
| **de-MLS (Vac)** | **No.** v4.0.0 library, pre-production, no RN binding, ≥⅔ honest members. | Track with Marmot/NIP-EE as the MLS-over-relay endgame. |
| **Programmes** | λPrize ($400–1,200 per prize, adoption-metric based), RFPs (all closed, "reopening soon"), Logos Circles (~30 cities). Two closed prizes were civic: LP-0016 anonymous forum with threshold moderation, LP-0017 whistleblower upload. | Low-effort optional: a write-up submission if a fitting prize reopens. No municipal deployment exists anywhere on the stack. |

**Reach rule (2026-09-14, Max):** the Expo app is the primary and, in practice, the only
client citizens use; the Next.js web app has no citizen users. Any integration that only
works in a browser or on a desktop (every Logos surface today) has zero reach. Judge each
row above by "does it land in Expo or on the node", nothing else.

**Net:** integrate nothing from Logos into the product path this year. Close the two real
gaps (a sovereign DM rail decision; content-addressed public media) with Nostr/Blossom,
which are live, JS-only and already federated. Keep Logos on a dated watchlist (§7).

---

## 1. What Logos is in September 2026

- **Organisation.** Institute of Free Technology (IFT; Jarrad Hope, Carl Bennetts; grew out
  of Status, 2017 ICO). Portfolio: Status, Logos, Nimbus, Keycard, Vac. "200+ core
  contributors." Framing on logos.co: "private-by-default technology stack for parallel
  societies"; the node repo says "for decentralized network states"; Logos Press Engine
  published *Farewell to Westphalia* (Sept 2025). Sources: https://free.technology/,
  https://logos.co/, https://github.com/logos-blockchain/logos-blockchain.
  *Repo rule unchanged: network-state vocabulary never appears on the Ortis/Amt surface.*
- **Rebrand 2025-11-20.** Waku → Logos Messaging (Delivery + Chat), Codex → Logos Storage,
  Nomos → Logos Blockchain. GitHub orgs renamed (`waku-org`, `codex-storage` are "legacy");
  npm packages are still `@waku/*`. Sources:
  https://chainwire.org/2025/11/20/logos-unifies-under-one-identity-to-deliver-a-private-tech-stack-to-revitalise-civil-society/,
  https://blog.waku.org/logos-messaging-monthly-update-november-2025/.
- **Timeline.** Testnet v0.1 2026-03-16 → v0.2 2026-06-30 ("expect breaking changes") →
  v0.2.1 2026-08-05 → Basecamp 0.3.0-rc.2 2026-09-11 (first Windows installer). Mainnet
  "early 2027", "timing might shift". Sources: https://blog.logos.co/article/logos-testnet-v01,
  https://blog.logos.co/article/testnet-v02-live, https://github.com/logos-co/logos-basecamp/releases,
  https://blog.nomos.tech/2025-year-in-review/.
- **Shape.** `liblogos` C++ microkernel, one OS process per module, capability tokens,
  modules are Qt6 plugins or Qt-free cdylibs packaged as `.lgx`, driven by `logosctl` or the
  Basecamp desktop shell. Headless daemon on Linux (systemd recipe) is documented. Sources:
  https://github.com/logos-co/logos-liblogos, https://docs.logos.co/run-a-node.
- **Identity.** No unified primitive. Chain wallet keys are Ed25519 + hash-based ZK keys
  (Wallet Technical Standard: "Bitcoin/Ethereum compatibility impossible"); LEZ private
  accounts use spend/view keys + ML-KEM-768; Chat uses XEdDSA "installations"; Storage uses
  libp2p peer ids; the only secp256k1 accounts module was archived Aug 2026. No ERC-1271, no
  DIDs, no naming. Sources: https://lip.logos.co/blockchain/raw/wallet-technical-standard.html,
  https://github.com/logos-co/logos-accounts-module.
  **Consequence:** our "one smart account as the identity root" thesis
  ([chat protocol decision](2026-07-26_CHAT_PROTOCOL_DECISION.md)) does not extend into Logos;
  any Logos integration is a separate key domain bound to the wallet by a signed statement,
  exactly as the Nostr bridge does today.

---

## 2. Messaging — Logos Delivery / Logos Chat (ex-Waku)

### 2.1 Facts

- **Delivery = the Waku transport**: Relay (GossipSub), RLN Relay, Filter, Light Push, Store,
  Peer Exchange, discv5. The FAQ is explicit: "no default encryption method is applied",
  "Logos Delivery does not guarantee the message's availability". Store v3 has "no explicit
  retention guarantees"; The Waku Network spec asks store nodes for **≥12 h** per shard;
  nwaku defaults to 48 h SQLite. Max message **150 KB**, recommended 4 KB average.
  Sources: https://docs.logos.co/messaging/get-started/faq,
  https://lip.logos.co/messaging/core/draft/64/network.html,
  https://lip.logos.co/messaging/core/draft/13/store.html.
- **RLN (spam protection) is testnet-only in 2026.** The public network's contract is on
  Ethereum Sepolia; the credential portal registers on Linea Sepolia; the planned Linea
  mainnet deployment was closed "not planned"; the 2026 direction is a pluggable backend
  (gasless Status Network for Status, LEE for Logos). Not Gnosis. The new docker stack ships
  with RLN "intentionally omitted". Sources: https://github.com/logos-messaging/pm/issues/258,
  https://roadmap.logos.co/messaging/roadmap/milestones/2026-add-support-for-rln-on-lee,
  https://github.com/logos-messaging/logos-delivery/tree/master/apps/logos_delivery_node/docker.
- **Chat = de-MLS groups (1:1 = 2-person group)**, "Preview", desktop (Linux/macOS, Nix).
  The Chat-module API "does not support attachments, delivery/read receipts, reactions,
  persistence (state resets on restart), offline messaging, post-creation metadata edits";
  address exchange is out-of-band. Sources:
  https://docs.logos.co/messaging/chat-module/build-logos-module-that-uses-chat-module-api,
  https://blog.logos.co/article/developer-update-july-2026.
- **SDKs.** JS `@waku/sdk` 0.0.36 on npm (browser + Node light node: LightPush/Filter/Store;
  relay in the browser is discouraged; Reliable Channels "experimental", "no automatic
  recovery" for lost messages). Go, Rust, Python bindings over `liblogosdelivery`. iOS and
  Android builds of `liblogosdelivery` were restored in v0.39.0-rc.2 (2026-09-07) and
  nim-libp2p gained mobile targets (July 2026), **but there is no React Native wrapper**;
  `@waku/react-native` was archived 2023-11-21. Sources:
  https://registry.npmjs.org/@waku/sdk/latest, https://docs.waku.org/build/javascript/reliable-channels,
  https://github.com/logos-messaging/logos-delivery/releases, https://github.com/waku-org/waku-react-native.
- **Mobile reality = Status.** Status mobile runs status-go (Go) with nwaku/libwaku inside.
  Its Logos Delivery cutover started May 2026; nightly functional tests on 2026-09-11 still
  show 9 failures (store timeouts, delivery confirmation). Source:
  https://github.com/status-im/status-go/issues/7820.
- **What Logos Chat is for.** `logos-chat` (Rust, crates `logos-chat` / `generic-chat` /
  `libchat`, all 0.1.0, "breaking changes are expected", SQLCipher store, embedded Delivery
  node) is the chat *protocol library*: authenticated 1:1 and group conversations over
  de-MLS. Its consumers are **(a)** Basecamp's C++ `logos-chat-module` + `logos-chat-ui`
  ("UI App for Logos ChatSDK POC") and **(b)** the **Status app**, via the milestone
  "Status: Logos Chat Integration" (published 2026-02-01): Status replaces its own chat
  protocol with Logos Chat for "1:1 chats, group chats, and eventually communities",
  consumed "through Logos Core via Go bindings via C-bindings" inside status-go, in three
  phases with both protocols running in parallel; it depends on "Chat — Beta (v0.3)". So
  the mobile path for Chat is *Status's* Go/C path through Logos Core, not a library an
  Expo app can import. The Nim chat SDK (`logos-chat-nim`) was archived 2026-09-09.
  Bindings that exist in the `logos-messaging` org are all for the **Delivery transport**:
  Go, Python, Rust, Node.js and Dart/Flutter wrappers over `liblogosdelivery`; the RN
  wrapper is archived (last push 2023-09-27). The roadmap's "Required for Mainnet" list
  contains **"Support Mobile Platforms"**, after Testnet v0.3 ("Chat — Beta"). Sources:
  https://github.com/logos-messaging/logos-chat,
  https://roadmap.logos.co/messaging/roadmap/milestones/2026-status-logos-chat-integration,
  https://roadmap.logos.co/messaging/roadmap/, https://api.github.com/orgs/logos-messaging/repos.
- **Push.** Status runs its own push-notification servers → gorush → APNs; Android since
  v2.38 (2026-06-12) uses an on-device background service instead. There is no serverless
  push; an offline iPhone is woken only by APNs with a cert-holding server. Sources:
  https://status.app/blog/status-v2-38-mobile-browser-private-notifications-new-l2-networks-and-a-faster-app-experience,
  https://github.com/status-im/specs/blob/master/docs/raw/push-notification-server.md.
- **E2E specs.** X3DH + double ratchet (LIP 53/54) are *Draft*; Noise sessions / device
  pairing are *Raw*; de-MLS v4.0.0 is a library "pre-production" with ≥⅔ honest-member
  assumption. Source: https://lip.logos.co/, https://github.com/vacp2p/de-mls/releases/tag/v4.0.0.
- **Production users.** Status (mobile + desktop, 9-node fleet), RAILGUN broadcasters, The
  Graph's Graphcast. Source: https://github.com/logos-messaging/awesome-logos-delivery.

### 2.2 Against the XMTP pain we actually have

| Pain (from `XMTP_INTEGRATION_STATE.md` and memory) | Whose fault | Would Waku fix it? |
|---|---|---|
| Chain-locked identities: 25 of 38 wallets lost their inbox after the Gnosis move | XMTP protocol (identity bound to first chain) | Yes, trivially: Waku has no identity, we would bind our own. But the loss is one-time and already handled. |
| New device cannot read older messages ("secret was deleted") | MLS forward secrecy, inherent | **No.** Any MLS system (de-MLS, Marmot) behaves the same; Waku alone has no history at all beyond best-effort Store. |
| 10-installation cap per inbox | XMTP | Yes (no cap), but `revokeInstallations` exists. |
| Native module crash loop on old builds, EAS build per native change | Ours (now guarded by `requireOptionalNativeModule`) | **Worse.** Waku in Expo means a native module we write and maintain ourselves. |
| Zombie push tokens, consent hydration bug, activation sheet friction | Ours | No. Same code path regardless of transport. |
| Sender-side-only push, no offline push for external wallets | Ours (notification server not deployed) | No. Waku needs the same APNs/FCM server. |
| Org chats still on Supabase, no attachments, no Anfragen UI | Our backlog | No. Waku ships none of these. |
| Centralised network today; ~$5 per 100k messages after the D14N cutover | XMTP | Yes: own nodes, zero marginal cost. Real, but euros per year at town scale. |

*(inference)* The honest summary: the protocol-level XMTP issues are either one-time (chain
lock), shared with every MLS design (multi-device history) or cheap (fees). The UX issues
are ours and follow us to any transport. Waku fixes the centralisation line item at the
price of owning a bespoke chat protocol on mobile.

### 2.3 What putting Waku into the Expo app would take

Three paths, none shipped by anyone:

1. **Expo native module over `liblogosdelivery`** (C FFI; iOS/Android static libs exist
   as of 2026-09-07). Build the Nim+Rust toolchain per platform, write Swift/Kotlin bridges
   plus a JS event emitter, ship under the `requireOptionalNativeModule` rule, new EAS build
   per change; background/battery behaviour is unpublished. Then build what Waku does not
   provide: wallet↔chat-key binding, contact discovery, E2E (port LIP 53/54 or run Noise
   sessions), local persistence, history via our own Store nodes with long retention, a
   push server, and content types for payments/reactions/receipts. *(inference)* A quarter
   of work before feature parity with today's XMTP rail, and we become the maintainer of
   a messaging protocol.
2. **`@waku/sdk` inside Hermes.** js-libp2p in React Native needs WebCrypto, streams and
   related polyfills; nobody documents it working in 2026. A one-week spike would settle
   it; success still leaves everything in path 1 except the native bridge.
3. **App ↔ our Delivery node over REST** (poll/subscribe on :8645). Loses every P2P
   property; it is our server with extra steps. Supabase Realtime or a plain WebSocket from
   the node does this better.

Compare the Nostr DM path already assessed (2026-08-05): JS-only, relay and identity bridge
live, NIP-17 today (no forward secrecy, key-derivation caveat, NIP-42 first), Marmot/MLS
later. Lower native risk, same sovereignty gain.

### 2.4 Where Waku genuinely fits us, and why we still pass for now

- **App-event pub/sub and in-app notification fan-out** (feed updates, orders, badge
  counts). This is Waku's best use case: content topics, autosharding, `ephemeral` flag,
  light protocols for browsers. But the primary client is Expo (no SDK), and the browser
  side would duplicate Supabase Realtime today and the node's own WebSocket after Stage 5 of
  the Supabase exit. No reason to run a second rail.
- **Node↔node and agent↔agent transport.** Federation runs on NIP-77 negentropy over Nostr
  relays and is live; the agent transport decision is Nostr/Buzz. A Waku rail would be a
  second protocol for the same job. The interesting Logos example here is **Muster**
  (multi-party Safe transaction coordination over `delivery_module`), which shows Waku can
  carry co-signing coordination; our Attester Safe does that via the Safe transaction
  service and does not need it.
- **OS push.** Waku changes nothing: APNs/FCM plus a token-holding server. The sovereign
  move is Stage 3 of the Supabase exit (`send-notification` on the node), not a transport
  swap.

**Triggers to reopen** (any one): Status completes the mobile Logos Delivery cutover and
publishes battery/background data; a Chat SDK reaches Beta with mobile bindings or an npm
package; RLN memberships are deployable on Gnosis (RLN-API CAIP-10 ids) or LEE mainnet is
live; a maintained RN/Expo module appears from anyone.

---

## 3. Storage — Logos Storage (ex-Codex)

### 3.1 Facts

- **Logos Storage exists; what it is has changed.** The official page describes it as
  "Privacy-preserving file sharing using content identifiers" and says "The module *will*
  support private file storage with files hosted across a decentralised network of nodes"
  (future tense). docs.logos.co/storage, verbatim: "the file is added to the network with
  1 replica (the uploading node)"; "the number of replicas is determined by the number of
  nodes interested in a given file"; "if no one is interested in your files, chances are
  that losing your node means your data is lost as well." Roadmap: the three gates
  "required for mainnet" are "Logos Core Integration", "Scalable, Simple Filesharing",
  "Privacy-Preserving Filesharing"; "Research on Incentivized, Anonymous Persistence" is
  listed **after** mainnet. Sources: https://logos.co/technology-stack/storage,
  https://docs.logos.co/storage, https://roadmap.logos.co/storage/roadmap/.
- **The durability engine was removed.** Aug 2025: marketplace/proving paused; Jan 2026:
  "removed unused modules such as the marketplace and proving logic". LIPs for
  erasure coding, marketplace, prover and slot builder are *deprecated*; the source tree no
  longer contains them; the REST spec has no marketplace endpoints. What ships: "if no one
  is interested in your files, chances are that losing your node means your data is lost
  as well"; replicas = "the number of nodes interested in a given file". Sources:
  https://blog.codex.storage/codex-august-updates-2/, https://blog.logos.co/article/developer-update-jan-2026,
  https://docs.logos.co/storage, https://lip.logos.co/storage/index.html.
- **No token, no payment, no SLA.** CDX was a testnet token; a June-2026 raw LIP models a
  future storage fee market on Logos Blockchain. Incentivised persistence is *post-mainnet*
  research. Sources: https://lip.logos.co/blockchain/raw/analysis-storage-market.html,
  https://roadmap.logos.co/storage/roadmap/.
- **CIDs are not IPFS CIDs.** CIDv1 + sha2-256 but private multicodecs `storage-manifest`
  0xCD01 / `storage-block` 0xCD02 / `storage-root` 0xCD03, a Codex-specific manifest and
  Merkle layout, discovery on Logos' own DHT. *(inference)* An IPFS gateway can neither
  parse the codec nor find the content. Sources:
  https://raw.githubusercontent.com/logos-storage/logos-storage-nim/master/storage/multicodec_exts.nim,
  https://lip.logos.co/storage/raw/manifest.html.
- **No encryption at rest, no access control, no network erasure.** "Anyone with that CID
  can retrieve the file"; `DELETE /data/{cid}` removes only the local copy. "Privacy" means
  unlinking provider and downloader over the mixnet (DHT lookups only so far). Sources:
  https://logos.co/technology-stack/storage, https://api.codex.storage, https://docs.logos.co/storage/concepts/mix.
- **No light client, no gateway.** Every SDK (JS `@codex-storage/sdk-js` 0.1.3, Python, Rust,
  Go, C++ module) talks to a node you run; a React Native app needs a self-hosted node
  behind our API. README still says pre-alpha; multi-GB uploads block the main loop
  (issues #1226, #1131); one concurrent transfer per module instance. Sources:
  https://github.com/logos-storage/logos-storage-nim, https://docs.logos.co/storage/build-app/build-cli-app-that-uses-storage-api.
- **Only real integration:** Status community history archives replacing BitTorrent
  (status-go #7312). Source: https://github.com/logos-storage/logos-storage-nim/milestones.
- **Running a node** is easy on a public-IP VPS: `logosstorage/logos-storage-nim` Docker
  image (~90 MB, amd64/arm64), `extip`, ports 8090/udp + 8091/tcp, REST on 8080
  (`/api/storage/v1/data`). Hardware requirements are not published for 2026. Source:
  https://roadmap.logos.co/testnets/logos-node-operator-guide.

### 3.2 What "a CID for every file" actually needs, and how we get it now

The goal behind the idea is sound: integrity-addressed public media that is not locked in
Supabase, verifiable from the signed record, and mirrorable by anyone. Three parts:

1. **The hash is already the identifier.** Every image in a published event is mirrored
   at `/media/<sha256>` on the node and the sha256 in the signed event is the integrity
   check (`packages/publisher/src/cli.ts`, `packages/indexer/src/api.ts`). That *is*
   content addressing; what is missing is a standard write side and peer mirroring.
2. **Blossom next to strfry** (Roadmap §12, the BUD specs; NIP-96 is deprecated in its
   favour). sha256-addressed blobs, `GET /<sha256>`, Nostr-signed uploads (kind 24242 auth
   events, so the same citizen key that signs the post authorises the media), delete by the
   owner, mirroring between servers (BUD-04), and a user server list (BUD-03) so any Nostr
   client resolves media without asking us. Peers that already mirror our relay (NSP-9)
   mirror the blobs the same way. Verify the exact BUD numbers against the current spec
   before implementing, as the NIP rule in `DATA_PLACEMENT_AND_CRUD.md` demands.
3. **Portability tag.** Derive an IPFS **CIDv1 `raw` + sha2-256** from the same digest for
   blobs up to ~1 MiB (identical hash, standard codec, resolvable by any IPFS node that has
   the bytes) and compute a UnixFS CID lazily only if we ever pin to IPFS. Carry it as a
   tag on the event next to the sha256. Never call a Logos Storage CID "IPFS".

**GDPR boundary (unchanged):** only media attached to records that may remain public
forever goes to Blossom and gets mirrored. Profile pictures and personal-account uploads
stay in the erasable store (Supabase Storage today, S3-compatible Garage/MinIO on the node
at Stage 4 of the Supabase exit). Cloudflare Stream stays for video; it is a CDN, not a
sovereignty problem.

**Optional experiment (≤2 days, zero production risk):** declare a `logos-storage` service
in the node manifest (installer rule: every service lands in `netizen render`), have the
publisher `POST /api/storage/v1/data` each public blob after mirroring, and record the
returned CID as a `logos-cid` tag. It demonstrates open data on the Logos testnet and costs
one container. It provides no durability and a second CID vocabulary in the record, so it
stays labelled experimental until Logos ships incentivised persistence (post-mainnet).

**Housekeeping found on the way:** the Expo Irys helper (`apps/expo/lib/irys-upload.ts`) is
a stub that fabricates `node2.irys.xyz/temp_…` URLs and stores evidence in Supabase, while
the web app has a real server-side Irys route. Proposal bodies and evidence therefore have
two different truths depending on the client. Whichever content-addressed store wins for
public documents (Blossom sha256 for the record; Irys/Arweave only if permanence is really
wanted), the Expo path should stop pretending.

---

## 4. Blockchain, networking, runtime — not now

- **LEZ = Logos Execution Zone**, the first Sovereign Zone, running the Logos Execution
  Environment: a RISC Zero zkVM executing stateless Rust programs (RISC-V), public and
  private accounts (commitments + nullifiers, ECDH + ChaCha20), permissioned sequencers.
  **Bedrock** = Cryptarchia private PoS (Groth16 proof of leadership, trusted setup, ~18 h
  economic finality) + **Mantle** UTXO ledger + **Blend** anonymous broadcast for proposals
  and Mantle transactions only (needs ≥16 staked core nodes or it silently degrades). Data
  availability layer was removed Jan 2026. MEV is "distributed, not removed" (their FAQ).
  Sources: https://logos.co/technology-stack/blockchain,
  https://lip.logos.co/blockchain/raw/lez/lee-v0.3-specifications.html,
  https://lip.logos.co/blockchain/raw/blend-protocol.html, https://docs.logos.co/blockchain/faq.
- **No EVM, no bridge.** Only an experimental Sepolia↔LEZ HTLC swap "not intended for
  production"; inter-zone bridging "makes no claim" on external chains. Sources:
  https://github.com/logos-co/eth-lez-atomic-swaps, https://blog.logos.co/article/interzone-bridging-logos.
- **Token**: no name, supply, allocation or date anywhere in primary sources; a PoW
  distribution LIP appeared 2026-09-09. Source: https://lip.logos.co/blockchain/raw/proof-of-work.html.
- **Networking**: LIP-99 `nim-libp2p-mix` (Sphinx, cover traffic, SURBs) is a general
  libp2p mixnet, used today for Storage DHT lookups and a 5-node chat demo; Waku's own lead
  raised latency/discovery concerns. Source:
  https://forum.research.logos.co/t/introducing-the-mix-protocol-enhancing-privacy-across-libp2p-networks/348.
- **Runtime/Basecamp**: see §1. JS SDK `logos-js-sdk` 2.0.0 is Node-only over koffi and not
  on npm; a web SDK "requires a feasibility study; blocked on liblogos single-process mode".
  Source: https://forum.research.logos.co/t/why-a-web-sdk-is-critical-for-logos-adoption/583.

*(inference)* For a DAO whose identity, governance, treasury and currency are on Gnosis with
ERC-4337 accounts, the only thing Logos Blockchain offers is a reference design for private
execution. The **Zone** idea (own state, borrowed consensus, state diffs inscribed on L1) is
worth reading as a pattern for a future "town zone", nothing more.

---

## 5. Reusable Vac primitives

- **zerokit RLN v3.0.0** (2026-08-04): Rust core, C FFI, `wasm32` build (stateless binding;
  `parallel` needs COOP/COEP headers), RLN v2 (`y = a0 + x·a1`), slashing via
  `recover_secret`. The Zerokit-API LIP gives standalone usage guidance (sliding root window,
  `verify_with_roots`, external nullifier = `poseidon([epoch, rln_identifier])`); the RLN-API
  LIP scopes memberships by CAIP-10 registry id. Sources:
  https://github.com/vacp2p/zerokit/releases, https://lip.logos.co/ (AnonComms: Zerokit API, RLN-API).
  **Fit:** an anonymous, rate-limited citizen post box ("1 anonymous suggestion per citizen
  per day", slash on abuse) using CitizenNFT-derived identity commitments, next to the
  existing web-only Semaphore v4 proving (`apps/web/src/lib/semaphore/*`). Web-first, because
  Hermes has no WASM and proving must stay client-side to be anonymous. Small, optional;
  belongs in the ZK/sybil track, not this quarter.
- **de-MLS v4.0.0**: library-ised Conversation API, transport-agnostic, Waku transport moved
  to a PoC repo; ACZ roadmap says "public testnet" before "ready for Waku production".
  Track together with Marmot/NIP-EE; neither has a React Native binding.
- **DST**: 1,000-node nim-libp2p Shadow runs "with complete message delivery" (June 2026)
  and "Logos Delivery reliability analysis with all experiments passing" (Aug 2026), but no
  public latency/loss numbers. Source: https://roadmap.vac.dev/monthly/2026-08.

---

## 6. Programmes and community

- **Field Station** (Dhun, Rajasthan, 23–31 Oct 2026; applications 11–26 Sept): one-week
  on-site builder residency; accommodation and meals covered, domestic travel support only,
  no stipend, "milestone-based grant funding" for the strongest prototypes with no amounts
  published; requires installing Basecamp and noting a block height. **Not pursued** (Max,
  2026-09-14: cannot attend). The λPrize catalogue "runs in parallel to the residency under
  its own normal rules", i.e. remotely, but its prizes are Basecamp/LEZ-shaped and pay about
  $400. Source: https://logos.co/field-station/.
- **λPrize** (2026-04-16): up to $500k total, $400–1,200 per prize in USDT, outcome-based,
  submission by PR. Civic-adjacent prizes already closed: LP-0016 anonymous forum with
  threshold moderation and slash-on-revocation; LP-0017 whistleblower flow (Storage upload →
  Delivery broadcast → optional on-chain anchor). Only LP-0018 (OpenStreetMap distribution)
  open. Sources: https://blog.logos.co/article/lambda-prize, https://github.com/logos-co/lambda-prize.
- **RFPs**: 13 listed, all closed, "reopening soon"; themes include attack-resistant public
  registries and decentralised archives. Source: https://github.com/logos-co/rfp.
- **Logos Circles**: ~30 city groups, steward onboarding; Circle Delhi runs a node for an
  education archive. No municipal deployment anywhere. Source: https://blog.logos.co/article/parallel-education-delhi.
- **Governance of the network itself**: none on-chain; specs move Raw → Draft → Stable by
  PR under 1/COSS. Source: https://lip.logos.co/about.html.

*(inference)* The prizes are visibility, not funding, at $400–1,200. If a public-registry or
anonymous-forum prize reopens, a write-up of what already exists here (MACI + Semaphore +
CitizenNFT + the public record) is a cheap submission. Nothing in the programmes justifies
engineering time on its own.

---

## 7. Recommended actions and watchlist

**Do now (independent of Logos):**

1. **Decide the DM rail** with the two live options on the table: finish the XMTP backlog
   (notification server, groups for orgs, Anfragen, attachments) **or** start the Nostr
   NIP-17 third rail on the own relay (NIP-42 first). Waku is not a third option in 2026.
2. **Blossom on the node** for content-addressed public media, the sha256 already in every
   event, plus a derived IPFS CIDv1 tag. Mirror only permanently-public media. This is the
   honest "CID for every file".
3. **Retire the Expo Irys stub** in favour of the same content-addressed path.

**Optional, cheap:** the Logos Storage pin sidecar (§3.2) as a showcase; a λPrize write-up if
a fitting prize reopens.

**Watchlist with triggers (re-check no earlier than 2027-04):**

| Watch | Trigger that changes the verdict |
|---|---|
| Logos Delivery on mobile | Status mobile cutover complete; published battery/background data; or any maintained RN/Expo module |
| Logos Chat | Beta status with mobile bindings or an npm package; receipts/attachments/persistence in the API |
| RLN memberships | Deployable on Gnosis (`eip155:100` via RLN-API) or LEE mainnet live |
| Logos Storage | Incentivised persistence shipped (post-mainnet); IPFS-compatible codecs or a gateway |
| Logos Blockchain | Mainnet live with a disclosed token; any EVM-compatible zone or production bridge |
| Web/JS SDK | `logos-js-sdk` on npm with a browser build |

---

## 8. Repo context this was checked against

`docs/XMTP_INTEGRATION_STATE.md`, `docs/XMTP_RESEARCH_2026-07.md`,
`docs/future-research/2026-07-26_CHAT_PROTOCOL_DECISION.md`,
`docs/future-research/2026-07-27_DATA_SOVEREIGNTY_SUPABASE_EXIT.md`,
`docs/DATA_PLACEMENT_AND_CRUD.md`, `docs/PUBLIC_DATA_ON_NOSTR.md`, `docs/STATE_OF_NOSTR.md`,
`docs/STATE_OF_THE_NETIZEN_STACK.md`, `docs/ROADMAP_AND_DEFERRED.md` (§12, §19),
`docs/RELAY_NODE_REBUILD.md`, `docs/MISSION_AND_GOALS.md` (G1–G6),
`packages/publisher/src/cli.ts`, `packages/indexer/src/api.ts`,
`packages/protocol/examples/roebel.netizen.json`, `apps/expo/lib/xmtp/*`,
`apps/expo/lib/upload-media.ts`, `apps/expo/lib/irys-upload.ts`,
`apps/web/src/app/api/irys/upload/route.ts`, `apps/web/src/lib/semaphore/*`,
`apps/expo/supabase/functions/send-notification/index.ts`. Relay and index were reachable
(`https://relay.roebel.app`, `https://index.roebel.app/manifest`, HTTP 200) at the time of
writing, so a Blossom server next to strfry has a host again.

## 9. Uncertainties

- Cluster ids of the `logos.dev` / `logos.test` / `status.prod` presets; message volumes and
  node counts beyond fleet dashboards.
- Battery/background behaviour of `liblogosdelivery` on iOS/Android: nothing published.
- Whether any mainnet RLN contract exists anywhere in 2026: every source says testnet only.
- Logos Storage hardware/disk requirements and testnet retention policy: not published.
- Whether codecs 0xCD01–03 are registered in the multicodec table: no evidence found.
- Basecamp 0.3.0 release notes are empty; bundled-module list unknown.
- Whether "early 2027" mainnet still holds: no primary source restates it after June 2026.
- XMTP decentralised-mainnet completion: no confirming post after February 2026.
- npm `@waku/sdk` 0.0.36 vs repo tag 0.0.37: unexplained.
