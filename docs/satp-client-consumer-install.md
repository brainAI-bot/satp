# SATP Client consumer install path

`@brainai/satp-client` can be consumed from stable npm, the rc npm channel, or
a reviewed SATP Git commit. AgentFolio's default is stable npm. A reviewed SATP
Git commit pin is allowed only when HQ assigns explicit AgentFolio/SATP
branch/PR coordination work, and the consumer PR must record the exact commit
SHA and reason for the temporary pin. Choose the source based on the artifact
the downstream app needs to prove:

Package naming decision `[#b3e7e7ce]`: SATP uses a phased umbrella/client split.
`@brainai/satp-client` is the stable consumer install path today. `@brainai/satp`
is reserved as the long-term umbrella package only after a separate release gate
publishes it and updates install-ready docs. See
[`docs/package-naming-decision.md`](./package-naming-decision.md).

| Channel | Use when | Dependency |
| --- | --- | --- |
| Stable npm | Production or default AgentFolio and other consumer installs should stay on the stable public package. | `@brainai/satp-client@2.0.3` or `@brainai/satp-client` |
| Historical rc exact version | Explicit HQ-assigned reproduction or lockfile evidence for the historical pre-stable artifact. | `@brainai/satp-client@2.0.2` |
| Release candidate tag | Explicit HQ-assigned rc validation where a moving dist-tag is acceptable and the task names the tag as the target. | `@brainai/satp-client@rc` |
| Reviewed Git commit | HQ-assigned PR coordination or source-review installs tied to an exact reviewed SATP commit. | `git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>` |

Registry readback on 2026-07-26 shows npm `latest` resolves to
`@brainai/satp-client@2.0.3` and the `rc` dist-tag resolves to `2.0.2`.
Stable consumers should use `latest`/`2.0.3` unless HQ assigns an explicit
release-candidate validation task.

Stable 2.0.3 provenance: HQ task `TASK-cc897dc9` records the Owner-approved
npm closeout for `@brainai/satp-client@2.0.3`, and `TASK-f53c7ecb` records the
source alignment merge for PR #107. This PR documents that live registry state;
it does not authorize a new publish or dist-tag mutation.

## RC-S6 semantic uncertainty compatibility

The merged RC-S6 semantic uncertainty work in `93db1b3` (PR #53,
`[#43394290]`) added executable offline conformance fixtures, and `a0252e8`
records that work as shipped on `main`. Consumers can run the gate with:

```bash
npm run test:conformance:rc-s6
```

Treat this gate as a compatibility signal, not as release promotion or live
network authority. Positive identity, linked-account, attestation, and trust
packet fixtures prove deterministic offline SDK/schema compatibility for the
reviewed RC-S6 artifact. Boundary fixtures for stale identity, revoked or
malformed attestations, unsupported issuers, score meaning, review weight,
escrow references, and AgentFolio consumer copy must remain warning or
fail-closed outcomes.

Consumers must not promote RC-S6 uncertainty outcomes into verified badges,
ranking, eligibility, trust-score changes, payment state, escrow readiness,
protected-action access, npm latest adoption, mainnet readiness, product launch
copy, or AgentFolio product approval. Stable consumer installs should remain on
`@brainai/satp-client@2.0.3` unless a separate HQ task assigns rc validation or
commit-pinned review.

## Stable npm dependency path

Use the current published npm package for stable consumer installs:

```bash
npm install @brainai/satp-client@2.0.3
```

```json
{
  "dependencies": {
    "@brainai/satp-client": "2.0.3"
  }
}
```

## Historical release-candidate dependency path

Use the exact historical rc package when downstream reproducibility or lockfile
readback is explicitly assigned as the auditable artifact:

```bash
npm install @brainai/satp-client@2.0.2
```

```json
{
  "dependencies": {
    "@brainai/satp-client": "2.0.2"
  }
}
```

Use the moving rc dist-tag only when HQ explicitly assigns the tag itself as the
validation target and accepts that it is mutable:

```bash
npm install @brainai/satp-client@rc
```

```json
{
  "dependencies": {
    "@brainai/satp-client": "rc"
  }
}
```

The current `rc` tag resolves to the historical `2.0.2` package, which is older
than stable `latest` `2.0.3`; it is not the default forward-looking consumer
channel.

Branch-only development and PR review can still use a commit-addressed Git
dependency on the SATP repository root. The repo root is intentionally named
`@brainai/satp-client`; its `main`, `types`, and `exports["."]` point at
the extracted client package entrypoint in `packages/satp-client/src/index.js`
and `packages/satp-client/src/index.d.ts`. This Git path is not npm latest and
must be pinned to a reviewed commit before it is used in mergeable consumer PRs.

## Branch-only dependency path for review

Use a commit-addressed Git dependency only for active SATP branch or PR review:

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

The branch form below is acceptable only for local active PR coordination. It is
not merge-safe for AgentFolio; the final dependency must pin an exact reviewed
commit hash and record the HQ reason for using a Git pin instead of stable npm:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#brainchain/satp-extract-001"
  }
}
```

## Why the Git path is review-only

- It does not depend on a sibling checkout or local tarball path.
- It avoids publishing from a review branch.
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

## Temporary consumer override for monitored uuid audit

Current `npm audit --package-lock-only` output reports a monitored moderate
advisory chain through `@solana/web3.js -> jayson -> uuid` for
[`GHSA-w5hq-g745-h8pq`](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The affected `uuid` range is `<11.1.1`; the upstream dependency path is owned
by `@solana/web3.js` and `jayson`, so SATP should not publish a package, tag, or
release only to force this transitive fix.

SATP's release-candidate branch pins the same transitive path with an npm
override at the repository root and in `packages/satp-client/package.json`:

```json
{
  "overrides": {
    "jayson": {
      "uuid": "^11.1.1"
    }
  }
}
```

This is a monitored semver override: `jayson@4.3.0` declares `uuid@^8.3.2`,
so the override intentionally steps outside that transitive dependency range.
Keep it until `@solana/web3.js` or `jayson` ships an upstream range that
resolves the audit chain without an application lockfile override.

AgentFolio and other package consumers should not rely on a dependency package's
own override to protect their final install tree. Consumer applications that
need this mitigation should carry the same root override or lockfile resolution
until the upstream dependency chain is fixed.

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
npm install --ignore-scripts --no-audit --no-fund ../satp/dist/brainai-satp-client-<VERSION>.tgz
```

Do not use the local tarball path as the merge dependency in AgentFolio.


## AgentFolio consumption readiness

For the AgentFolio-specific rule text, source-linked package boundary, allowed
install forms, and offline readiness checks, see
[`docs/agentfolio-consumption-readiness.md`](./agentfolio-consumption-readiness.md).

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
