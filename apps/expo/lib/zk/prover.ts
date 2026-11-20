/**
 * On-device Semaphore prover (credreg-6 Task 1, measurement gate). Proofs are made inside a hidden
 * WebView (components/zk/ZkProverHost.tsx) running snarkjs — Hermes has no proven WebAssembly
 * path and no new native module is allowed. This module is the app-side transport: it sends a
 * request to the mounted host, waits for the answer and never throws.
 *
 * Artifacts are self-hosted under ARTIFACT_BASE_URL and used only when their SHA-256 matches
 * ARTIFACT_SHA256 (pinned here, checked inside the page). The identity secret goes only to the
 * WebView on this device.
 */

/** Semaphore circuit artifacts (published by PSE as semaphore 4.13.0, used by @semaphore-protocol/proof 4.14.2). */
export const ARTIFACT_BASE_URL = 'https://www.roebel.app/zk/semaphore/4.14.2/';

/** SHA-256 (hex) of `semaphore-<depth>.wasm` / `.zkey` for tree depths 1–20. */
export const ARTIFACT_SHA256: Record<number, { wasm: string; zkey: string }> = {
  1: { wasm: '70289ef3bdfa86e97debdb227e76721b392f45b5e73d5e7136d93a04dce0dff9', zkey: '471a978875f91411b21ba5a2fbea41df30ec45eb23e3ac045edf7f30a2846a08' },
  2: { wasm: '877a989a8881ff6651866cfa32088f60e4abcb02a26f2e995868dfabd7f9385b', zkey: '110e2d9de78730aa4f5c78c75017cfe4d769b4b7ce60f58484fb14733d7b0f35' },
  3: { wasm: '48e15502f710be0a623d573d472edeeaf918fd5eee0b2ca9b407c4e4f20d12f2', zkey: 'c36653c42784df35a01f3d93415af9ad8292a540f8deb134a6a34a01752a89d3' },
  4: { wasm: 'ec0ed0ae7eb0264070b36a247cf4aad8157c5550f0731d3462019526e5e9ae4f', zkey: '90c94bad7ad97eeb9314750e443d84da783e38a21f55538d72b10d258064f6e6' },
  5: { wasm: '74ee373fc66bf81ca89de52602b555f16ef0e54c0e36e5b69c6e109d146acfb5', zkey: 'a1431c24dc49e98d07d48e7bdacc002875bcb02a799d9156c6aa6bcbe0838926' },
  6: { wasm: '432293aa5c8e7d503148824ff17a8ad7318058a656af568837f30675d867827e', zkey: '24a7ef2c7f4c809a502e876cb3295535a73710ec7bc3827b5a15018e434a674a' },
  7: { wasm: '3ba75768d5dfbee9d52b732b69eefb1725c8c356a3de9c2f2a71dbc401a0ea61', zkey: 'd77851ee4bd496c6b5f70fbfa550f113a89bad972efd4c541267e566163d0600' },
  8: { wasm: '4edc07444a1d48d09014c963e315d3351b6e12838d83fcb1962071614b1c94b9', zkey: 'd02521afe7133a97421244374d4bc005c1ebd7d7cf7c51e88b7e99fdaf183146' },
  9: { wasm: 'a75f9d92dc826629e3490596ec99055bbecc006050dee6bf8e81b99c9a54f16a', zkey: '0eae4df76414b885a2f0793740330de896ab13f07504f97c81b5fe92868ce90e' },
  10: { wasm: '1e9e1e3ad9917164bc96c751e32fae724400b92063f5a2cfd22ca64674bf4f96', zkey: 'f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a' },
  11: { wasm: '8261bedcadf797674ebf89fa3ed09e4cd37747bb77c8b21379f9d7c582ed8189', zkey: '04d46b1be01a5ff56129318e64f3ec2c833277674a6cb787ca562893de2ec49d' },
  12: { wasm: '3b7c0b34b00e5c87946d6e1689c05ce75f2dd93618ceb803dd369ff6ad65876e', zkey: '3beb3d676455cca9c7c66f34a6147f8ba213b1db1812e2c1be2c00f129477229' },
  13: { wasm: '517a55315564fc1622aee17df0ec4579aacf7f2c21753887016f728c9ce1596c', zkey: '54378ba8d31fff7c89857228cb9dc089e837f6c8b256ab0a1b8c8cdbdcf815f9' },
  14: { wasm: '7a525e7c179b16731de40f902563200480dce98d7015ddda634de5da344b9f6b', zkey: '2e85d8f4a841bc0d1e223316082d3f64c855ff52083a53278dae92f49b54ff9e' },
  15: { wasm: 'd6c588754c6f1af9555cb14bbf01091116c7dbc605adc3cedd4ed644a5800c60', zkey: '076f4d7e6e2484f4cd19226b5ef622f36f6de7a99e44570e4b29c9d4fb0dfca0' },
  16: { wasm: '06df31461d17db86897fc234f0e6e5f5e2f6add1b8c821b5c6ae75030b3e0d7c', zkey: '948763c7315a337b7722c0344a28af4be66fbbc618474d6dbe9036e799d1a3b5' },
  17: { wasm: 'c8a9fa66d491cc6a14daba40060d53659c99ca9d9b1277cc48c1a174cb5947c4', zkey: '5c750bf1fdec2b1bb4b04f66a4e64c08215c9f3f862ffb3f35de511cc6417112' },
  18: { wasm: '70e2ac9d915265708742c4d8dbbe20662b22f701d9e78745c5bc2a0262093317', zkey: 'ef278d79e103d6944be80428ad65acdef22bdd6fe32f95a8f0ed182e1b6601ce' },
  19: { wasm: '18f939aca1233779a75c8bbfb69f0ffb6a146a88b2c1160cb9265f9357f1a706', zkey: '7329ed1332c163788b36da10be73ac3eb004fbf1b8b308e1778cf815dd209e3b' },
  20: { wasm: '6f71e55586929e520e76027ebe067daac8b41e2f4b8057313a5fd0304e1e44ee', zkey: '33f9a067a80c7daf90e085449073613a9559a1904dd40aeb6d603afb7988c2cc' },
};

export type SemaphoreProofJson = {
  merkleTreeDepth: number;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  scope: string;
  points: string[];
};

export type ProveRequest = {
  id: string;
  identitySecret: string;
  /** Decimal commitments, ordered as in the group. */
  members: string[];
  message: string;
  scope: string;
  depth: number;
};

export type ProveFailure = 'timeout' | 'artifact_mismatch' | 'not_member' | 'crashed';
export type ProveResult =
  | { ok: true; proof: SemaphoreProofJson; ms: number }
  | { ok: false; code: ProveFailure; message: string };

export const DEFAULT_TIMEOUT_MS = 45_000;

type Answer = { id?: string; ok?: boolean; type?: string; [k: string]: unknown };
type Pending = { resolve: (a: Answer) => void };

let send: ((msg: object) => void) | null = null;
const pending = new Map<string, Pending>();
const timeoutListeners = new Set<() => void>();

/** Called by ZkProverHost when its page is ready (send) or gone (null). */
export function setProverTransport(next: ((msg: object) => void) | null): void {
  send = next;
}

/** ZkProverHost restarts its WebView when a request timed out. */
export function onProverTimeout(cb: () => void): () => void {
  timeoutListeners.add(cb);
  return () => timeoutListeners.delete(cb);
}

/** Raw `postMessage` data from the page. Unknown or late answers are ignored. */
export function handleProverMessage(data: string): void {
  let msg: Answer;
  try {
    msg = JSON.parse(data) as Answer;
  } catch {
    return;
  }
  if (typeof msg?.id !== 'string') return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  p.resolve(msg);
}

/** Fail everything in flight (the WebView crashed or was restarted). */
export function failAllPending(message: string): void {
  for (const [id, p] of pending) {
    pending.delete(id);
    p.resolve({ id, ok: false, code: 'crashed', message });
  }
}

function request(msg: { id: string } & object, timeoutMs: number): Promise<Answer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(msg.id);
      timeoutListeners.forEach((cb) => cb());
      resolve(null);
    }, timeoutMs);
    pending.set(msg.id, {
      resolve: (a) => {
        clearTimeout(timer);
        resolve(a);
      },
    });
    try {
      send?.(msg);
    } catch {
      // The host is gone; the timeout answers.
    }
  });
}

const CODES: readonly ProveFailure[] = ['timeout', 'artifact_mismatch', 'not_member', 'crashed'];

/** Make one proof. Never throws; `ms` is the proving time measured inside the page. */
export async function prove(req: ProveRequest, opts: { timeoutMs?: number } = {}): Promise<ProveResult> {
  const pins = ARTIFACT_SHA256[req.depth];
  if (!pins) return { ok: false, code: 'crashed', message: `unsupported depth ${req.depth}` };
  const answer = await request(
    {
      type: 'prove',
      ...req,
      artifacts: {
        wasmUrl: `${ARTIFACT_BASE_URL}semaphore-${req.depth}.wasm`,
        zkeyUrl: `${ARTIFACT_BASE_URL}semaphore-${req.depth}.zkey`,
        wasmSha256: pins.wasm,
        zkeySha256: pins.zkey,
      },
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!answer) return { ok: false, code: 'timeout', message: 'Der Beweis hat zu lange gedauert.' };
  if (answer.ok === true && answer.proof && typeof answer.ms === 'number') {
    return { ok: true, proof: answer.proof as SemaphoreProofJson, ms: answer.ms };
  }
  const code = CODES.includes(answer.code as ProveFailure) ? (answer.code as ProveFailure) : 'crashed';
  return { ok: false, code, message: typeof answer.message === 'string' ? answer.message : code };
}

/** The identity commitment for a secret, computed in the page (benchmark helper). */
export async function commitmentOf(id: string, identitySecret: string, timeoutMs = 15_000): Promise<string | null> {
  const answer = await request({ type: 'commitment', id, identitySecret }, timeoutMs);
  return answer?.ok === true && typeof answer.commitment === 'string' ? answer.commitment : null;
}
