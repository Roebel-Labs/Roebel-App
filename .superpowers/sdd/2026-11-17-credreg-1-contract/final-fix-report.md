# Final fix report
1. deploy-credential-registry.cjs: record (credentialRegistry, txHash, mined:false, verified:false) written right after send, updated after wait() (mined, deployBlock) and verification. Dry run with throwaway key: OK, "dry run: nothing sent."
2. @netizen-labs/protocol moved to devDependencies (package.json + pnpm-lock importer). `pnpm install --frozen-lockfile --offline` OK; grep in src empty.
3. Audit doc: SourcesProposed never expires limit + chained-swap sentence added.
4. Plan doc L115 updated; matches revokeLeaves (skips already-revoked, emits per newly revoked).
5. reader.loadRegister throws on chunk <= 0n; test added.
6. replay.test: true-then-false with privateOnlyOrgs assertion.
Tests: credential-registry 24 pass, typecheck clean; hardhat vector test 8 passing.
