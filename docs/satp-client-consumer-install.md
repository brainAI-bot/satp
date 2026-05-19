# SATP Client consumer install path

`@brainai/satp-client` is delivered from the SATP repository without publishing
to npm. The durable/merge-safe path is a commit-addressed Git dependency on the
SATP repository root. The root package is intentionally named
`@brainai/satp-client`; its `main`, `types`, and `exports["."]` point at
the extracted client package entrypoint in `packages/satp-client/src/index.js`
and `packages/satp-client/src/index.d.ts`.

## Durable dependency path for AgentFolio

Use a commit-addressed Git dependency:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
  }
}
```

Verified TASK-2dfc2845 dependency string:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#dc1ee3cf50b082367a7e897c60e405f33416c1a0"
  }
}
```

The branch form below is acceptable for active PR coordination, but the final
merge-safe dependency should pin a commit hash:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#brainchain/satp-extract-001"
  }
}
```

## Why this is durable and merge-safe

- It does not depend on a sibling checkout or local tarball path.
- It does not require npm publish.
- npm can install it from a clean external consumer using only GitHub access.
- Pinning a commit makes the dependency immutable and reviewable in the consumer
  lockfile.
- The SATP repo root remains `private: true`, so the package is installable from
  Git for branch/PR use but not accidentally publishable to npm.

## Verification from a clean consumer

```bash
npm install --ignore-scripts --no-audit --no-fund
node - <<'NODE'
console.log(require.resolve('@brainai/satp-client'));
const satp = require('@brainai/satp-client');
for (const key of ['SATPSDK', 'SATPV3SDK', 'createSATPClient']) {
  if (!(key in satp)) throw new Error(`missing export ${key}`);
}
console.log('satp client dependency path ok');
NODE
```

Expected result: `require.resolve('@brainai/satp-client')` resolves under the
consumer `node_modules/@brainai/satp-client`, and the package exposes
`SATPSDK`, `SATPV3SDK`, `createSATPClient`, `getV3ProgramIds`,
`hashAgentId`, `getGenesisPDA`, and `prepareIdentityAttestationRequest`.

The repo also carries a repeatable clean-consumer smoke:

```bash
npm run smoke:consumer-install
```

## Offline identity attestation request helper

Consumers can prepare deterministic identity-attestation request metadata
without RPC, signing, credential access, or a transaction build:

```js
const { prepareIdentityAttestationRequest } = require('@brainai/satp-client');

const request = prepareIdentityAttestationRequest({
  subjectWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  agentId: 'brainChain',
  claimType: 'github_verified',
  metadataHash: '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7',
  attester: 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc',
  network: 'devnet',
});

console.log(request.signingRequired); // false
console.log(request.instructions);    // []
console.log(request.genesisPda);
console.log(request.attestationPda);
console.log(request.requestHash);
```

The helper returns plain JSON-safe data including normalized public keys, the
agent ID hash, Genesis and Attestation PDA fields, program IDs, and a stable
`requestHash`. It intentionally returns `signingRequired: false`,
`instructions: []`, `signers: []`, and `transaction: null`; callers that decide
to submit a write transaction must build, review, and sign that transaction in a
separate flow.

## Tarball fallback for local debugging only

A local tarball can still be produced for isolated debugging:

```bash
npm run pack:satp-client
npm install --ignore-scripts --no-audit --no-fund ../satp/dist/brainai-satp-client-0.0.0-extraction.tgz
```

Do not use the local tarball path as the merge dependency in AgentFolio.


## Package-boundary hardening reference

For the current package-name/version audit, CI gate, export-surface requirements, and security guardrails, see [`docs/package-boundary.md`](./package-boundary.md).

## Rollback notes

Remove the Git dependency from the consumer package manifest and reinstall:

```bash
npm uninstall @brainai/satp-client
rm -rf node_modules package-lock.json
npm install --ignore-scripts --no-audit --no-fund
```

No npm publish, Solana deploy, keypair action, mainnet/devnet write,
AgentFolio product code change, Masthead work, client work, or public launch is
part of this install path.
