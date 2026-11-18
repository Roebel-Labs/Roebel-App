/**
 * The app side of the WebView prover: a host that never answers is a timeout, a page that
 * reports a hash mismatch is artifact_mismatch, a well-formed answer passes through with ms.
 */
import { ARTIFACT_SHA256, handleProverMessage, prove, setProverTransport, type ProveRequest } from '../prover';

const req = (id: string): ProveRequest => ({ id, identitySecret: 's', members: ['1', '2'], message: '1', scope: '2', depth: 4 });

afterEach(() => setProverTransport(null));

it('pins artifacts for depths 1 to 20', () => {
  for (let d = 1; d <= 20; d++) {
    expect(ARTIFACT_SHA256[d].wasm).toMatch(/^[0-9a-f]{64}$/);
    expect(ARTIFACT_SHA256[d].zkey).toMatch(/^[0-9a-f]{64}$/);
  }
});

it('resolves timeout when the host never answers', async () => {
  setProverTransport(() => {});
  await expect(prove(req('a'), { timeoutMs: 20 })).resolves.toMatchObject({ ok: false, code: 'timeout' });
});

it('resolves artifact_mismatch when the page reports a hash mismatch', async () => {
  setProverTransport((msg: any) => {
    expect(msg.artifacts.zkeySha256).toBe(ARTIFACT_SHA256[4].zkey);
    expect(msg.artifacts.wasmUrl).toBe('https://www.roebel.app/zk/semaphore/4.14.2/semaphore-4.wasm');
    handleProverMessage(JSON.stringify({ id: msg.id, ok: false, code: 'artifact_mismatch', message: 'hash mismatch' }));
  });
  await expect(prove(req('b'))).resolves.toEqual({ ok: false, code: 'artifact_mismatch', message: 'hash mismatch' });
});

it('passes a well-formed answer through with ms', async () => {
  const proof = { merkleTreeDepth: 4, merkleTreeRoot: '1', nullifier: '2', message: '1', scope: '2', points: ['0'] };
  setProverTransport((msg: any) => handleProverMessage(JSON.stringify({ id: msg.id, ok: true, proof, ms: 812 })));
  await expect(prove(req('c'))).resolves.toEqual({ ok: true, proof, ms: 812 });
});
