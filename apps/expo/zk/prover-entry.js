/**
 * Runs inside the hidden prover WebView (components/zk/ZkProverHost.tsx), bundled by
 * build-prover.mjs. Hermes has no proven WebAssembly path, so snarkjs runs here instead.
 *
 * In:  window.__zkReceive({ type: 'prove', id, identitySecret, members, message, scope, depth,
 *                           artifacts: { wasmUrl, zkeyUrl, wasmSha256, zkeySha256 } })
 *      window.__zkReceive({ type: 'commitment', id, identitySecret })
 * Out: ReactNativeWebView.postMessage(JSON) — { id, ok: true, proof, ms } | { id, ok: true, commitment }
 *      | { id, ok: false, code: 'artifact_mismatch' | 'not_member' | 'crashed', message }
 *      and once { type: 'ready' }.
 *
 * Artifacts come only from the URLs the app passes (self-hosted) and are used only when their
 * SHA-256 matches the pin the app passes. The identity secret never leaves this page.
 */
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { generateProof } from '@semaphore-protocol/proof';

const cache = new Map(); // `${url}#${sha}` -> Uint8Array (verified against that pin)

function post(msg) {
  window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function load(url, sha) {
  const key = `${url}#${sha}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { code: 'crashed' });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!sha || (await sha256Hex(bytes)) !== sha.toLowerCase()) {
    throw Object.assign(new Error(`hash mismatch for ${url}`), { code: 'artifact_mismatch' });
  }
  cache.set(key, bytes);
  return bytes;
}

async function handle(msg) {
  const identity = new Identity(msg.identitySecret);
  if (msg.type === 'commitment') return { id: msg.id, ok: true, commitment: identity.commitment.toString() };
  if (msg.type !== 'prove') throw Object.assign(new Error(`unknown request ${msg.type}`), { code: 'crashed' });

  const commitment = identity.commitment.toString();
  if (!msg.members.includes(commitment)) {
    throw Object.assign(new Error('identity is not in the group'), { code: 'not_member' });
  }
  const a = msg.artifacts;
  const [wasm, zkey] = await Promise.all([load(a.wasmUrl, a.wasmSha256), load(a.zkeyUrl, a.zkeySha256)]);
  const group = new Group(msg.members.map((m) => BigInt(m)));
  const started = performance.now();
  const proof = await generateProof(identity, group, msg.message, msg.scope, msg.depth, { wasm, zkey });
  const ms = Math.round(performance.now() - started);
  // BigInts do not survive JSON: the proof object uses decimal strings already.
  return { id: msg.id, ok: true, proof, ms };
}

window.__zkReceive = (msg) => {
  handle(msg)
    .then(post)
    .catch((e) => post({ id: msg && msg.id, ok: false, code: e && e.code ? e.code : 'crashed', message: String((e && e.message) || e) }));
};

post({ type: 'ready' });
