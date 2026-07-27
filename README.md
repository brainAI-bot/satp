# SATP Client

@brainai/satp-client is the JavaScript/TypeScript SDK surface for SATP
identity, reputation, attestation, validation, review, and escrow helpers.

## Install Path

Package naming decision `[#b3e7e7ce]`: SATP uses a phased umbrella/client split.
Use `@brainai/satp-client` for stable consumers today. Reserve `@brainai/satp`
as the future umbrella package until a separate release gate publishes it and
updates install-ready docs. See
[`docs/package-naming-decision.md`](./docs/package-naming-decision.md).

Choose the dependency source by release channel:

| Channel | Use when | Dependency |
| --- | --- | --- |
| Stable npm | Production or default consumer installs that should follow the public stable package. | `npm install @brainai/satp-client@2.0.3` or `npm install @brainai/satp-client` |
| Historical rc exact version | Downstream apps need reproducible evidence for an explicitly assigned historical pre-stable package. | `npm install @brainai/satp-client@2.0.2` |
| Release candidate tag | Downstream apps are validating the moving rc tag itself under an explicit HQ task. | `npm install @brainai/satp-client@rc` |
| Reviewed Git commit | PR coordination or unpublished review work where the exact repository commit is the artifact under review. | `git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>` |

Registry readback on 2026-07-26 shows npm `latest` resolves to
`@brainai/satp-client@2.0.3` and the `rc` dist-tag resolves to `2.0.2`.
Stable consumers should use `latest`/`2.0.3` unless HQ assigns an explicit
release-candidate validation task.

Stable consumers can pin the current published npm package:

    {
      "dependencies": {
        "@brainai/satp-client": "2.0.3"
      }
    }

For rc validation, use the rc dist-tag only when HQ assigns that moving
pre-stable artifact as the auditable target:

    {
      "dependencies": {
        "@brainai/satp-client": "rc"
      }
    }

For reproducible historical rc evidence, use the exact package version instead:

    {
      "dependencies": {
        "@brainai/satp-client": "2.0.2"
      }
    }

For branch-only development or PR review, pin a reviewed SATP Git commit:

    {
      "dependencies": {
        "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
      }
    }

The Git review package root is intentionally named @brainai/satp-client,
remains private: true, and exposes packages/satp-client/src/index.js plus
packages/satp-client/src/index.d.ts through the package exports map. Do not
treat a branch-only Git dependency as npm latest.

## Quickstart

Install the stable client package, then start with an offline read-only trust
packet. This flow performs no RPC write, signing, live x402 payment, Solana
deploy, keypair access, or npm publish.

```bash
npm install @brainai/satp-client@2.0.3
```

```js
const {
  buildSatpTrustPacket,
  validateSatpTrustPacket,
} = require('@brainai/satp-client');

const packet = buildSatpTrustPacket({
  subjectWallet: '11111111111111111111111111111111',
  agentId: 'brainChain',
  claimType: 'identity',
  metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
  network: 'devnet',
});

const validation = validateSatpTrustPacket(packet);
if (!validation.ok) throw new Error(validation.errors.join('; '));
console.log(packet.mode);
```

For a longer consumer walkthrough covering stable npm, release candidates,
Git-review pins, conformance checks, and network boundaries, see
[`docs/quickstart.md`](./docs/quickstart.md).

The runtime/product next-slice plan for SDK ergonomics, local attestation
request verification, MCP/x402 examples, and AgentFolio reference-consumer
follow-through lives in
[`docs/runtime-product-next-slice-v0.md`](./docs/runtime-product-next-slice-v0.md).

## API Surface

    const {
      SATPSDK,
      SATPV3SDK,
      createSATPClient,
      getV3ProgramIds,
      hashAgentId,
      getGenesisPDA,
      prepareIdentityAttestationRequest,
      buildSatpTrustPacket,
      validateSatpTrustPacket,
      buildSignerSeparationConfig,
      validateSignerSeparationConfig,
    } = require('@brainai/satp-client');

Subpath imports under @brainai/satp-client/src/* remain available for existing
consumers during the review phase.

`buildSignerSeparationConfig(opts)` prepares a public-key-only policy packet for
separating a low-privilege operational signer from the Owner-held upgrade
authority. It does not read keypairs, generate keys, transfer authority, deploy,
publish, or write Solana state. See `docs/operational-signer-separation.md`.

## Read-only Trust Packets

`buildSatpTrustPacket(opts)` derives a deterministic SATP trust packet for
consumer preflight. It wraps the unsigned identity-attestation request with the
program IDs, Genesis PDA, attestation PDA, request hash, and explicit flags that
show no signer, transaction, RPC write, live x402 payment, or package publish is
required to display or queue the packet.

    const {
      buildSatpTrustPacket,
      validateSatpTrustPacket,
    } = require('@brainai/satp-client');

    const trustPacket = buildSatpTrustPacket({
      subjectWallet: '11111111111111111111111111111111',
      agentId: 'brainChain',
      claimType: 'identity',
      metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
      network: 'devnet',
    });

    const validation = validateSatpTrustPacket(trustPacket);
    if (!validation.ok) throw new Error(validation.errors.join('; '));

The trust-packet shape uses `schemaVersion: 'satp.trustPacket.v1'`,
`packetType: 'satp-trust-packet'`, and
`mode: 'offline-readonly-trust-packet'`. `validateSatpTrustPacket(packet)`
fails closed when `packetType` is not exactly `satp-trust-packet`, when the
read-only flags are changed, or when PDA/request fields no longer match a
freshly derived packet.

## Verification

    npm install --ignore-scripts --no-audit --no-fund
    npm run ci

npm run ci validates committed IDLs, syntax-checks client sources, verifies the
public export surface, runs a clean external-consumer install smoke test, and
runs the offline SDK/Borsh tests.

RC-S6 conformance fixture coverage is tracked in `docs/conformance.md`. The
fixture suite is executable offline through `npm run test:conformance:rc-s6`
and was merged in `93db1b3` (PR #53, `[#43394290]`). Consumer compatibility
notes for the semantic uncertainty outcomes are recorded in
`docs/release-candidates/satp-client-2.0.2-rc.0-semantic-uncertainty-3653fd5a.md`
and `docs/satp-client-consumer-install.md`.

This package task does not publish to npm, deploy Solana programs, write to
mainnet/devnet, read or move keypairs, change AgentFolio product code, perform
client work, or make public announcements.
