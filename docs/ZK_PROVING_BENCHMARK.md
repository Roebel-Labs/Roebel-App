# ZK proving benchmark (credreg-6, owner gate G1)

Plan: `docs/superpowers/plans/2026-11-17-credreg-6-zk.md`, Task 1. Tasks 2–7 start only after the
results below meet open question 4: on the reference low-end Android, a proof for a group of up to
1,024 members takes **at most 10 s at the median and 20 s at the 95th percentile**, without the
app being killed. If the bar is missed: decide between a native prover in a store build and
server-assisted proving (weaker anonymity against the node).

## What is measured

A hidden WebView (`components/zk/ZkProverHost.tsx`) runs snarkjs with `@semaphore-protocol/proof`
4.14.2 (bundle: `apps/expo/zk/prover-entry.js` → `node zk/build-prover.mjs` →
`zk/prover-html.generated.ts`, committed). The screen `app/dev/zk-bench.tsx` (route `/dev/zk-bench`,
dev builds and the preview channel only) makes 10 proofs each for groups of 16, 256 and 1,024
random members (tree depth 4, 8, 10) and reports median, p95, the slowest proof (`maxMs`), failures
and WebView restarts. Times are measured inside the page (artifact download excluded; the first
proof of each depth includes compiling the circuit WebAssembly).

Checked on the Mac (Node, same bundle): a depth-4 proof in ~1 s that `verifyProof` accepts; a
wrong artifact pin answers `artifact_mismatch`; an identity outside the group answers `not_member`.

## Steps (owner)

1. Host the artifacts: `cd apps/expo && node zk/fetch-artifacts.mjs` (downloads depths 4, 8, 10
   from PSE, checks them against the SHA-256 pins in `lib/zk/prover.ts`, writes
   `apps/web/public/zk/semaphore/4.14.2/`). Commit those files (or upload them to the same path)
   and deploy web, so `https://www.roebel.app/zk/semaphore/4.14.2/semaphore-10.zkey` answers 200.
2. Open `/dev/zk-bench` in a dev build or a preview-channel update on the reference low-end Android
   (and, for comparison, one iPhone). Tap "Messung starten", wait, tap "Kopieren".
3. Paste the JSON below and fill the table.

## Results

| Date | Device (model, RAM, year class) | OS | Group | Depth | Median ms | p95 ms | Max ms | ok/10 | Restarts | Meets bar? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | 16 | 4 | | | | | | |
| | | | 256 | 8 | | | | | | |
| | | | 1,024 | 10 | | | | | | |

Raw JSON:

```json
```

Decision (G1): _pending_
